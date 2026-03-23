import {
  ANGLE_MAX,
  ANGLE_MIN,
  POWER_MAX,
  POWER_MIN,
  WEAPONS,
  WEAPON_ORDER
} from "../content/definitions";
import {
  getAiAirStrikeTimingValue,
  resolveAirStrikeTiming
} from "../core/airStrike";
import { createSeededRandom } from "../core/random";
import {
  applyCommand,
  cloneMatchState,
  estimateShotCommandScore,
  getActiveTank
} from "../core/simulation";
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
  executionAngleJitter: number;
  executionPowerJitter: number;
  executionTargetJitter: number;
  awayShotPenalty: number;
}

interface PlannedShot {
  weaponId: WeaponId;
  score: number;
  angleDeg: number;
  power: number;
  targetX?: number;
  airStrikeAccuracy?: number;
  airStrikeFeedback?: "Perfect" | "Good" | "Off";
}

const DIFFICULTY_CONFIG: Record<TankState["aiDifficulty"], DifficultyConfig> = {
  easy: {
    angleStep: 12,
    powerStep: 10,
    angleJitter: 7,
    powerJitter: 8,
    targetJitter: 5,
    executionAngleJitter: 7,
    executionPowerJitter: 9,
    executionTargetJitter: 6,
    awayShotPenalty: 28
  },
  medium: {
    angleStep: 10,
    powerStep: 9,
    angleJitter: 5,
    powerJitter: 6,
    targetJitter: 4,
    executionAngleJitter: 3,
    executionPowerJitter: 4,
    executionTargetJitter: 3.5,
    awayShotPenalty: 24
  },
  hard: {
    angleStep: 5,
    powerStep: 5,
    angleJitter: 2,
    powerJitter: 2.5,
    targetJitter: 1.5,
    executionAngleJitter: 0.75,
    executionPowerJitter: 1,
    executionTargetJitter: 1,
    awayShotPenalty: 18
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
  let bestShot = findBestShot(match, tank, target, difficulty, random);

  if (!bestShot) {
    if (tank.currentFuel >= 3) {
      const direction = target.x > tank.x ? 1 : -1;
      return [...commands, { type: "move", direction }, { type: "fire" }];
    }

    return [...commands, { type: "fire" }];
  }

  let shotContext = match;
  let actingTank = tank;

  if (bestShot.score < 16 && tank.currentFuel >= 5) {
    const direction = target.x > tank.x ? 1 : -1;
    const steps = 2 + Math.floor(random() * 3);
    const movedState = cloneMatchState(match);
    let moved = false;

    for (let index = 0; index < steps; index += 1) {
      const moveCommand: MatchCommand = { type: "move", direction };
      const result = applyCommand(movedState, moveCommand);

      if (result.endsWith("moved.")) {
        commands.push(moveCommand);
        moved = true;
        continue;
      }

      break;
    }

    if (moved) {
      const movedTank = getActiveTank(movedState);
      const movedTarget =
        movedState.tanks.find((candidate) => candidate.id === target.id) ?? null;

      if (movedTank && movedTarget) {
        const refinedShot = findBestShot(
          movedState,
          movedTank,
          movedTarget,
          difficulty,
          random
        );

        if (refinedShot) {
          bestShot = refinedShot;
          shotContext = movedState;
          actingTank = movedTank;
        }
      }
    }
  }

  const plannedShot = applyExecutionVariance(
    bestShot,
    shotContext,
    difficulty,
    tank.aiDifficulty,
    random
  );

  if (plannedShot.weaponId !== tank.selectedWeaponId) {
    commands.push({ type: "selectWeapon", weaponId: plannedShot.weaponId });
  }

  commands.push({
    type: "adjustAngle",
    delta: plannedShot.angleDeg - actingTank.angleDeg
  });
  commands.push({
    type: "adjustPower",
    delta: plannedShot.power - actingTank.power
  });

  if (typeof plannedShot.targetX === "number") {
    commands.push({
      type: "fire",
      targetX: plannedShot.targetX,
      airStrikeAccuracy: plannedShot.airStrikeAccuracy,
      airStrikeFeedback: plannedShot.airStrikeFeedback
    });
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
): PlannedShot | null {
  let bestShot: PlannedShot | null = null;

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
        const score = adjustNonTargetedShotScore(
          estimateShotCommandScore(
            match,
            tank.id,
            weaponId,
            candidateAngle,
            candidatePower
          ),
          candidateAngle,
          tank,
          target,
          difficulty
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

function adjustNonTargetedShotScore(
  score: number,
  angleDeg: number,
  tank: TankState,
  target: TankState,
  difficulty: DifficultyConfig
): number {
  if (!Number.isFinite(score)) {
    return score;
  }

  if (isShotHeadingAwayFromTarget(angleDeg, target.x - tank.x)) {
    return score - difficulty.awayShotPenalty;
  }

  return score;
}

function isShotHeadingAwayFromTarget(angleDeg: number, horizontalDelta: number): boolean {
  if (Math.abs(horizontalDelta) < 0.75) {
    return false;
  }

  const launchDirection = Math.cos((angleDeg * Math.PI) / 180);

  if (Math.abs(launchDirection) < 0.08) {
    return false;
  }

  return Math.sign(launchDirection) !== Math.sign(horizontalDelta);
}

function applyExecutionVariance(
  shot: PlannedShot,
  match: MatchState,
  difficulty: DifficultyConfig,
  aiDifficulty: TankState["aiDifficulty"],
  random: () => number
): PlannedShot {
  if (typeof shot.targetX === "number") {
    if (shot.weaponId === "airStrike") {
      const meterValue = getAiAirStrikeTimingValue(aiDifficulty, random);
      const timing = resolveAirStrikeTiming(shot.targetX, meterValue, match.arenaWidth);

      return {
        ...shot,
        targetX: timing.adjustedTargetX,
        airStrikeAccuracy: timing.accuracy,
        airStrikeFeedback: timing.feedback
      };
    }

    return {
      ...shot,
      targetX: clamp(
        shot.targetX + jitter(random, difficulty.executionTargetJitter),
        0,
        match.arenaWidth
      )
    };
  }

  return {
    ...shot,
    angleDeg: clamp(
      shot.angleDeg + jitter(random, difficulty.executionAngleJitter),
      ANGLE_MIN,
      ANGLE_MAX
    ),
    power: clamp(
      shot.power + jitter(random, difficulty.executionPowerJitter),
      POWER_MIN,
      POWER_MAX
    )
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
