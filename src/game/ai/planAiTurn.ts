import { WEAPONS, WEAPON_ORDER } from "../content/definitions";
import { createSeededRandom } from "../core/random";
import { estimateShotCommandScore, getActiveTank } from "../core/simulation";
import type {
  MatchCommand,
  MatchState,
  TankState,
  WeaponId
} from "../core/types";

interface DifficultyConfig {
  angleStep: number;
  powerStep: number;
  angleJitter: number;
  powerJitter: number;
  targetJitter: number;
}

const DIFFICULTY_CONFIG: Record<TankState["aiDifficulty"], DifficultyConfig> = {
  easy: {
    angleStep: 12,
    powerStep: 10,
    angleJitter: 7,
    powerJitter: 8,
    targetJitter: 5
  },
  medium: {
    angleStep: 8,
    powerStep: 7,
    angleJitter: 4,
    powerJitter: 5,
    targetJitter: 3
  },
  hard: {
    angleStep: 5,
    powerStep: 5,
    angleJitter: 2,
    powerJitter: 2.5,
    targetJitter: 1.5
  }
};

export function planAiTurn(match: MatchState): MatchCommand[] {
  const tank = getActiveTank(match);

  if (!tank || tank.controller !== "ai" || !tank.alive) {
    return [];
  }

  const enemies = match.tanks.filter(
    (candidate) => candidate.alive && candidate.teamId !== tank.teamId
  );

  if (enemies.length === 0) {
    return [{ type: "declareDraw" }];
  }

  const random = createSeededRandom(match.seed ^ match.turnNumber ^ hashId(tank.id));
  const difficulty = DIFFICULTY_CONFIG[tank.aiDifficulty];
  const commands: MatchCommand[] = [];

  if (tank.itemInventory.repairKit > 0 && tank.currentHp <= tank.maxHp * 0.45) {
    commands.push({ type: "useItem", itemId: "repairKit" });
  }

  if (tank.itemInventory.shield > 0 && tank.shieldHp <= 0 && tank.currentHp <= tank.maxHp * 0.7) {
    commands.push({ type: "useItem", itemId: "shield" });
  }

  if (tank.itemInventory.teleport > 0 && tank.currentHp <= tank.maxHp * 0.25) {
    const safeX = pickSafestTeleportX(match, tank);

    return [...commands, { type: "teleport", targetX: safeX }];
  }

  const target = pickTarget(tank, enemies);
  const bestShot = findBestShot(match, tank, target, difficulty, random);

  if (!bestShot) {
    if (tank.currentFuel >= 3) {
      const direction = target.x > tank.x ? 1 : -1;
      return [...commands, { type: "move", direction }, { type: "fire" }];
    }

    return [...commands, { type: "fire" }];
  }

  if (bestShot.score < 16 && tank.currentFuel >= 5) {
    const direction = target.x > tank.x ? 1 : -1;
    const steps = 2 + Math.floor(random() * 3);

    for (let index = 0; index < steps; index += 1) {
      commands.push({ type: "move", direction });
    }
  }

  if (bestShot.weaponId !== tank.selectedWeaponId) {
    commands.push({ type: "selectWeapon", weaponId: bestShot.weaponId });
  }

  commands.push({
    type: "adjustAngle",
    delta: bestShot.angleDeg - tank.angleDeg
  });
  commands.push({
    type: "adjustPower",
    delta: bestShot.power - tank.power
  });

  if (typeof bestShot.targetX === "number") {
    commands.push({ type: "fire", targetX: bestShot.targetX });
  } else {
    commands.push({ type: "fire" });
  }

  return commands;
}

function findBestShot(
  match: MatchState,
  tank: TankState,
  target: TankState,
  difficulty: DifficultyConfig,
  random: () => number
): {
  weaponId: WeaponId;
  score: number;
  angleDeg: number;
  power: number;
  targetX?: number;
} | null {
  let bestShot:
    | {
        weaponId: WeaponId;
        score: number;
        angleDeg: number;
        power: number;
        targetX?: number;
      }
    | null = null;

  for (const weaponId of WEAPON_ORDER) {
    if (!hasWeaponAmmo(tank, weaponId)) {
      continue;
    }

    const weapon = WEAPONS[weaponId];

    if (weapon.targeted) {
      const targetX = target.x + jitter(random, difficulty.targetJitter);
      const score = estimateShotCommandScore(
        match,
        tank.id,
        weaponId,
        tank.angleDeg,
        tank.power,
        targetX
      );

      if (!bestShot || score > bestShot.score) {
        bestShot = {
          weaponId,
          score,
          angleDeg: tank.angleDeg,
          power: tank.power,
          targetX
        };
      }

      continue;
    }

    for (let angle = 18; angle <= 162; angle += difficulty.angleStep) {
      for (let power = 28; power <= 84; power += difficulty.powerStep) {
        const candidateAngle = angle + jitter(random, difficulty.angleJitter);
        const candidatePower = power + jitter(random, difficulty.powerJitter);
        const score = estimateShotCommandScore(
          match,
          tank.id,
          weaponId,
          candidateAngle,
          candidatePower
        );

        if (!bestShot || score > bestShot.score) {
          bestShot = {
            weaponId,
            score,
            angleDeg: candidateAngle,
            power: candidatePower
          };
        }
      }
    }
  }

  return bestShot;
}

function pickTarget(tank: TankState, enemies: TankState[]): TankState {
  return [...enemies].sort((left, right) => {
    const leftScore =
      Math.abs(left.x - tank.x) * 0.6 + left.currentHp * 0.4 - left.shieldHp * 0.2;
    const rightScore =
      Math.abs(right.x - tank.x) * 0.6 + right.currentHp * 0.4 - right.shieldHp * 0.2;

    return leftScore - rightScore;
  })[0];
}

function pickSafestTeleportX(match: MatchState, tank: TankState): number {
  let safestX = tank.x;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let x = 14; x <= match.arenaWidth - 14; x += 6) {
    let nearestEnemyDistance = Infinity;

    for (const candidate of match.tanks) {
      if (!candidate.alive || candidate.teamId === tank.teamId) {
        continue;
      }

      nearestEnemyDistance = Math.min(nearestEnemyDistance, Math.abs(candidate.x - x));
    }

    if (nearestEnemyDistance > bestScore) {
      safestX = x;
      bestScore = nearestEnemyDistance;
    }
  }

  return safestX;
}

function hasWeaponAmmo(tank: TankState, weaponId: WeaponId): boolean {
  return tank.weaponInventory[weaponId] === -1 || tank.weaponInventory[weaponId] > 0;
}

function jitter(random: () => number, amplitude: number): number {
  return (random() - 0.5) * amplitude * 2;
}

function hashId(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}
