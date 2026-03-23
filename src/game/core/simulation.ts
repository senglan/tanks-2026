import {
  AIRSTRIKE_SPAWN_HEIGHT,
  ANGLE_MAX,
  ANGLE_MIN,
  FIXED_STEP_SECONDS,
  MOVE_FUEL_COST,
  MOVE_STEP_DISTANCE,
  POWER_MAX,
  POWER_MIN,
  REPAIR_ITEM_HP,
  SHIELD_ITEM_HP,
  TANK_HALF_WIDTH,
  WEAPON_ORDER
} from "../content/definitions";
import {
  chooseAirStrikeRunDirection,
  getAirStrikeFeedbackFromAccuracy
} from "./airStrike";
import { ECONOMY, WEAPONS, getEngineMoveMultiplier } from "../content/definitions";
import {
  canMoveTo,
  carveCrater,
  cloneTerrain,
  normalizeTankX,
  resolveSurfaceInfo,
  sampleTerrainHeight
} from "./terrain";
import type {
  AirStrikeRunState,
  MatchCommand,
  MatchState,
  ProjectileState,
  RoundOutcome,
  TankState,
  WeaponId
} from "./types";

const GRAVITY = 30;
const WIND_ACCELERATION = 1.45;
const TANK_HIT_RADIUS = 1.35;

export function getActiveTank(match: MatchState): TankState | null {
  return match.tanks[match.activeTankIndex] ?? null;
}

export function applyCommand(match: MatchState, command: MatchCommand): string {
  const activeTank = getActiveTank(match);

  if (!activeTank || match.phase !== "command" || !activeTank.alive) {
    return "The active tank cannot act right now.";
  }

  switch (command.type) {
    case "move":
      return moveTank(match, activeTank, command.direction);
    case "adjustAngle":
      activeTank.angleDeg = clamp(
        activeTank.angleDeg + command.delta,
        ANGLE_MIN,
        ANGLE_MAX
      );
      return `${activeTank.displayName} adjusted angle.`;
    case "adjustPower":
      activeTank.power = clamp(
        activeTank.power + command.delta,
        POWER_MIN,
        POWER_MAX
      );
      return `${activeTank.displayName} adjusted power.`;
    case "cycleWeapon":
      return cycleWeapon(activeTank, command.direction);
    case "selectWeapon":
      return selectWeapon(activeTank, command.weaponId);
    case "useItem":
      return useItem(activeTank, command.type === "useItem" ? command.itemId : "shield");
    case "fire":
      return fireWeapon(
        match,
        activeTank,
        command.targetX,
        command.airStrikeAccuracy,
        command.airStrikeFeedback
      );
    case "teleport":
      return teleportTank(match, activeTank, command.targetX);
    case "declareDraw":
      declareDraw(match);
      return "Draw declared.";
    default:
      return "Unknown command.";
  }
}

export function stepMatch(match: MatchState, deltaSeconds: number): void {
  updateAirStrikeRun(match, deltaSeconds);

  if (match.phase !== "resolving") {
    updateExplosions(match, deltaSeconds);
    return;
  }

  updateExplosions(match, deltaSeconds);

  const remainingProjectiles: ProjectileState[] = [];

  for (const projectile of match.projectiles) {
    if (projectile.spawnDelay > 0) {
      projectile.spawnDelay = Math.max(0, projectile.spawnDelay - deltaSeconds);
      remainingProjectiles.push(projectile);
      continue;
    }

    projectile.vx += match.wind.force * WIND_ACCELERATION * deltaSeconds;
    projectile.vy -= GRAVITY * deltaSeconds;
    projectile.x += projectile.vx * deltaSeconds;
    projectile.y += projectile.vy * deltaSeconds;

    const impactTank = findTankCollision(match, projectile);

    if (impactTank) {
      explodeProjectile(match, projectile, projectile.x, projectile.y);
      continue;
    }

    const terrainHeight = sampleTerrainHeight(match.terrain, projectile.x);

    if (
      projectile.x < 0 ||
      projectile.x > match.arenaWidth ||
      projectile.y <= match.terrain.floor ||
      projectile.y <= terrainHeight
    ) {
      explodeProjectile(
        match,
        projectile,
        clamp(projectile.x, 0, match.arenaWidth),
        Math.max(match.terrain.floor, Math.min(projectile.y, terrainHeight))
      );
      continue;
    }

    remainingProjectiles.push(projectile);
  }

  match.projectiles = remainingProjectiles;

  if (match.projectiles.length === 0) {
    finishResolution(match);
  }
}

export function cloneMatchState(match: MatchState): MatchState {
  return {
    ...match,
    terrain: cloneTerrain(match.terrain),
    tanks: match.tanks.map((tank) => ({
      ...tank,
      weaponInventory: { ...tank.weaponInventory },
      itemInventory: { ...tank.itemInventory },
      upgrades: { ...tank.upgrades }
    })),
    projectiles: match.projectiles.map((projectile) => ({ ...projectile })),
    explosions: match.explosions.map((explosion) => ({ ...explosion })),
    airStrikeRun: match.airStrikeRun ? { ...match.airStrikeRun } : null,
    outcome: match.outcome ? { ...match.outcome } : null
  };
}

export function estimateShotCommandScore(
  match: MatchState,
  tankId: string,
  weaponId: WeaponId,
  angleDeg: number,
  power: number,
  targetX?: number
): number {
  const clone = cloneMatchState(match);
  const actingIndex = clone.tanks.findIndex((tank) => tank.id === tankId);

  if (actingIndex === -1) {
    return Number.NEGATIVE_INFINITY;
  }

  clone.activeTankIndex = actingIndex;
  clone.phase = "command";

  const tank = clone.tanks[actingIndex];

  if (!tank.alive || !hasWeaponAmmo(tank, weaponId)) {
    return Number.NEGATIVE_INFINITY;
  }

  tank.angleDeg = angleDeg;
  tank.power = power;
  tank.selectedWeaponId = weaponId;

  const before = clone.tanks.map((candidate) => ({
    id: candidate.id,
    hp: candidate.currentHp,
    alive: candidate.alive
  }));

  const message = applyCommand(
    clone,
    WEAPONS[weaponId].targeted ? { type: "fire", targetX } : { type: "fire" }
  );

  if (message.startsWith("Choose")) {
    return Number.NEGATIVE_INFINITY;
  }

  let safety = 0;

  while (clone.projectiles.length > 0 && safety < 960) {
    stepMatch(clone, FIXED_STEP_SECONDS);
    safety += 1;
  }

  let score = 0;

  for (const previous of before) {
    const current = clone.tanks.find((candidate) => candidate.id === previous.id);

    if (!current) {
      continue;
    }

    const hpLoss = previous.hp - current.currentHp;

    if (hpLoss <= 0) {
      continue;
    }

    if (current.id === tank.id) {
      score -= hpLoss * 1.3;
      continue;
    }

    if (current.teamId === tank.teamId) {
      score -= hpLoss * 2;
      continue;
    }

    score += hpLoss * 1.8;

    if (previous.alive && !current.alive) {
      score += 20;
    }
  }

  return score;
}

function moveTank(
  match: MatchState,
  tank: TankState,
  direction: -1 | 1
): string {
  if (tank.currentFuel < MOVE_FUEL_COST) {
    return "Out of fuel.";
  }

  const distance = MOVE_STEP_DISTANCE * getEngineMoveMultiplier(tank.upgrades);
  const targetX = normalizeTankX(match.terrain, tank.x + direction * distance);

  if (!canMoveTo(match.terrain, tank.x, targetX)) {
    return "Terrain is too steep.";
  }

  tank.currentFuel = Math.max(0, tank.currentFuel - MOVE_FUEL_COST);
  applyTankSurface(match, tank, targetX);

  return `${tank.displayName} moved.`;
}

function cycleWeapon(tank: TankState, direction: -1 | 1): string {
  const currentIndex = WEAPON_ORDER.indexOf(tank.selectedWeaponId);

  for (let offset = 1; offset <= WEAPON_ORDER.length; offset += 1) {
    const nextIndex =
      (currentIndex + direction * offset + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    const candidate = WEAPON_ORDER[nextIndex];

    if (hasWeaponAmmo(tank, candidate)) {
      tank.selectedWeaponId = candidate;
      return `${tank.displayName} selected ${WEAPONS[candidate].name}.`;
    }
  }

  return "No weapons available.";
}

function selectWeapon(tank: TankState, weaponId: WeaponId): string {
  if (!hasWeaponAmmo(tank, weaponId)) {
    return "That weapon is not available.";
  }

  tank.selectedWeaponId = weaponId;
  return `${tank.displayName} selected ${WEAPONS[weaponId].name}.`;
}

function useItem(tank: TankState, itemId: "shield" | "repairKit"): string {
  if (tank.itemInventory[itemId] <= 0) {
    return `No ${itemId} remaining.`;
  }

  if (itemId === "shield") {
    if (tank.shieldHp > 0) {
      return "A shield is already active.";
    }

    tank.itemInventory.shield -= 1;
    tank.shieldHp = SHIELD_ITEM_HP;
    return `${tank.displayName} activated a shield.`;
  }

  if (tank.currentHp >= tank.maxHp) {
    return "HP is already full.";
  }

  tank.itemInventory.repairKit -= 1;
  tank.currentHp = Math.min(tank.maxHp, tank.currentHp + REPAIR_ITEM_HP);

  return `${tank.displayName} repaired damage.`;
}

function fireWeapon(
  match: MatchState,
  tank: TankState,
  targetX?: number,
  airStrikeAccuracy?: number,
  airStrikeFeedback?: "Perfect" | "Good" | "Off"
): string {
  const weapon = WEAPONS[tank.selectedWeaponId];

  if (weapon.targeted && typeof targetX !== "number") {
    return "Choose a target before firing.";
  }

  if (!hasWeaponAmmo(tank, weapon.id)) {
    return "That weapon is unavailable.";
  }

  if (tank.weaponInventory[weapon.id] > 0) {
    tank.weaponInventory[weapon.id] -= 1;
  }

  const created = createProjectiles(match, tank, weapon.id, targetX, airStrikeAccuracy);
  const feedback =
    weapon.id === "airStrike"
      ? (airStrikeFeedback ?? getAirStrikeFeedbackFromAccuracy(created.airStrikeAccuracy))
      : null;

  match.projectiles = created.projectiles;
  match.airStrikeRun = created.airStrikeRun;
  match.phase = "resolving";
  match.announcement =
    feedback === null
      ? `${tank.displayName} fired ${weapon.name}.`
      : `${tank.displayName} called ${weapon.name} (${feedback}).`;

  return match.announcement;
}

function teleportTank(match: MatchState, tank: TankState, targetX: number): string {
  if (tank.itemInventory.teleport <= 0) {
    return "No teleports remaining.";
  }

  tank.itemInventory.teleport -= 1;
  applyTankSurface(match, tank, normalizeTankX(match.terrain, targetX));
  match.announcement = `${tank.displayName} teleported.`;
  advanceTurnOrEndRound(match);

  return match.announcement;
}

function declareDraw(match: MatchState): void {
  for (const tank of match.tanks) {
    if (tank.alive) {
      tank.money += ECONOMY.drawBonus;
    }
  }

  match.phase = "roundOver";
  match.outcome = {
    kind: "draw",
    winningTeamId: null,
    winningTankId: null,
    reason: "A draw was declared."
  };
  match.announcement = "Round ended in a draw.";
}

function finishResolution(match: MatchState): void {
  const roundOutcome = determineRoundOutcome(match);

  if (roundOutcome) {
    match.phase = "roundOver";
    match.outcome = roundOutcome;
    match.announcement = roundOutcome.reason;
    return;
  }

  advanceTurnOrEndRound(match);
}

function advanceTurnOrEndRound(match: MatchState): void {
  const roundOutcome = determineRoundOutcome(match);

  if (roundOutcome) {
    match.phase = "roundOver";
    match.outcome = roundOutcome;
    match.announcement = roundOutcome.reason;
    return;
  }

  const nextIndex = findNextAliveTankIndex(match, match.activeTankIndex);

  if (nextIndex === null) {
    match.phase = "roundOver";
    match.outcome = {
      kind: "draw",
      winningTeamId: null,
      winningTankId: null,
      reason: "All tanks were destroyed."
    };
    match.announcement = match.outcome.reason;
    return;
  }

  match.activeTankIndex = nextIndex;
  match.phase = "command";
  match.turnNumber += 1;
  match.announcement = `${match.tanks[nextIndex].displayName} to act`;
}

function determineRoundOutcome(match: MatchState): RoundOutcome | null {
  const livingTanks = match.tanks.filter((tank) => tank.alive);

  if (livingTanks.length === 0) {
    return {
      kind: "draw",
      winningTeamId: null,
      winningTankId: null,
      reason: "All tanks were destroyed."
    };
  }

  const livingTeams = new Set(livingTanks.map((tank) => tank.teamId));

  if (livingTeams.size === 1 && livingTanks.length === 1) {
    return {
      kind: "victory",
      winningTeamId: livingTanks[0].teamId,
      winningTankId: livingTanks[0].id,
      reason: `${livingTanks[0].displayName} won the round.`
    };
  }

  if (livingTeams.size === 1) {
    return {
      kind: "victory",
      winningTeamId: livingTanks[0].teamId,
      winningTankId: null,
      reason: `Team ${livingTanks[0].teamId} won the round.`
    };
  }

  return null;
}

function applyTankSurface(match: MatchState, tank: TankState, x: number): void {
  const surface = resolveSurfaceInfo(match.terrain, x);
  tank.x = surface.x;
  tank.y = surface.y;
  tank.tiltDeg = surface.tiltDeg;
}

function createProjectiles(
  match: MatchState,
  tank: TankState,
  weaponId: WeaponId,
  targetX?: number,
  airStrikeAccuracy?: number
): {
  projectiles: ProjectileState[];
  airStrikeRun: AirStrikeRunState | null;
  airStrikeAccuracy: number;
} {
  const weapon = WEAPONS[weaponId];

  if (weapon.id === "airStrike") {
    return createAirStrikeProjectiles(
      match,
      tank,
      weapon.id,
      clamp(targetX ?? tank.x, 0, match.arenaWidth),
      airStrikeAccuracy
    );
  }

  const projectiles: ProjectileState[] = [];
  const baseSpeed = weapon.muzzleVelocity * (tank.power / 50);

  for (let index = 0; index < weapon.projectileCount; index += 1) {
    const spread = weapon.projectileCount === 1
      ? 0
      : (index - (weapon.projectileCount - 1) / 2) * weapon.spreadDeg;
    const angleRad = ((tank.angleDeg + spread) * Math.PI) / 180;

    projectiles.push({
      id: `${weapon.id}-${index}-${Date.now()}-${Math.random()}`,
      ownerTankId: tank.id,
      ownerTeamId: tank.teamId,
      weaponId,
      x: tank.x + Math.cos(angleRad) * (TANK_HALF_WIDTH + 0.75),
      y: tank.y + Math.sin(angleRad) * 2.4,
      vx: Math.cos(angleRad) * baseSpeed,
      vy: Math.sin(angleRad) * baseSpeed,
      radius: 0.28,
      damage: weapon.damage,
      splashRadius: weapon.splashRadius,
      terrainRadius: weapon.terrainRadius,
      terrainDepth: weapon.terrainDepth,
      spawnDelay: index * weapon.projectileDelay
    });
  }

  return {
    projectiles,
    airStrikeRun: null,
    airStrikeAccuracy: 1
  };
}

function createAirStrikeProjectiles(
  match: MatchState,
  tank: TankState,
  weaponId: "airStrike",
  targetX: number,
  airStrikeAccuracy?: number
): {
  projectiles: ProjectileState[];
  airStrikeRun: AirStrikeRunState;
  airStrikeAccuracy: number;
} {
  const weapon = WEAPONS[weaponId];
  const accuracy = clamp(airStrikeAccuracy ?? 0.72, 0.22, 1);
  const spreadScale = 1 + (1 - accuracy) * 0.45;
  const direction = chooseAirStrikeRunDirection(
    match.seed,
    match.turnNumber,
    tank.id,
    targetX
  );
  const lineLength = (10 + weapon.projectileCount * 2) * spreadScale;
  const lineStart = targetX - lineLength / 2;
  const driftVelocity = direction * (2.2 + (1 - accuracy) * 1.6);
  const spawnY = AIRSTRIKE_SPAWN_HEIGHT + 1;
  const runSpan = lineLength + 12;
  const runDuration = Math.max(
    0.8,
    (weapon.projectileCount - 1) * weapon.projectileDelay + 1.25
  );
  const runStartX = clamp(targetX - direction * (runSpan / 2), -10, match.arenaWidth + 10);
  const runEndX = clamp(targetX + direction * (runSpan / 2), -10, match.arenaWidth + 10);
  const projectiles: ProjectileState[] = [];

  for (let index = 0; index < weapon.projectileCount; index += 1) {
    const alpha = weapon.projectileCount === 1 ? 0.5 : index / (weapon.projectileCount - 1);
    const jitterSign = index % 2 === 0 ? -1 : 1;
    const lateralJitter = jitterSign * (1 - accuracy) * 0.55;
    const spawnX = clamp(lineStart + alpha * lineLength + lateralJitter, 0, match.arenaWidth);

    projectiles.push({
      id: `${weapon.id}-${match.roundNumber}-${match.turnNumber}-${tank.id}-${index}`,
      ownerTankId: tank.id,
      ownerTeamId: tank.teamId,
      weaponId,
      x: spawnX,
      y: spawnY,
      vx: driftVelocity,
      vy: -weapon.muzzleVelocity * (0.86 + (1 - accuracy) * 0.08),
      radius: 0.3,
      damage: weapon.damage,
      splashRadius: weapon.splashRadius * spreadScale,
      terrainRadius: weapon.terrainRadius * spreadScale,
      terrainDepth: weapon.terrainDepth,
      spawnDelay: index * weapon.projectileDelay
    });
  }

  return {
    projectiles,
    airStrikeRun: {
      id: `airstrike-run-${match.roundNumber}-${match.turnNumber}-${tank.id}`,
      ownerTankId: tank.id,
      direction,
      centerX: targetX,
      startX: runStartX,
      endX: runEndX,
      entryY: AIRSTRIKE_SPAWN_HEIGHT + 6,
      diveDepth: 8 + (1 - accuracy) * 2.6,
      elapsed: 0,
      duration: runDuration
    },
    airStrikeAccuracy: accuracy
  };
}

function explodeProjectile(
  match: MatchState,
  projectile: ProjectileState,
  impactX: number,
  impactY: number
): void {
  if (projectile.terrainRadius > 0 && projectile.terrainDepth > 0) {
    carveCrater(
      match.terrain,
      impactX,
      projectile.terrainRadius,
      projectile.terrainDepth
    );
  }
  match.explosions.push({
    id: `${projectile.id}-explosion`,
    x: impactX,
    y: impactY,
    radius: projectile.splashRadius,
    ttl: 0.45
  });

  const owner = match.tanks.find((tank) => tank.id === projectile.ownerTankId) ?? null;

  for (const tank of match.tanks) {
    if (!tank.alive) {
      continue;
    }

    const distance = Math.hypot(tank.x - impactX, tank.y - impactY);

    if (distance > projectile.splashRadius + TANK_HIT_RADIUS) {
      continue;
    }

    const damageFactor = clamp(1 - distance / (projectile.splashRadius + TANK_HIT_RADIUS), 0, 1);
    const rawDamage = Math.round(projectile.damage * damageFactor);

    if (rawDamage <= 0) {
      continue;
    }

    const hpDamage = applyDamage(tank, rawDamage);

    if (hpDamage > 0 && owner) {
      owner.damageDealtThisRound += hpDamage;
      applyRewards(owner, tank, hpDamage, !tank.alive);
    }
  }

  for (const tank of match.tanks) {
    if (tank.alive) {
      applyTankSurface(match, tank, tank.x);
    }
  }
}

function applyDamage(tank: TankState, rawDamage: number): number {
  let remainingDamage = rawDamage;

  if (tank.shieldHp > 0) {
    const absorbed = Math.min(tank.shieldHp, remainingDamage);
    tank.shieldHp -= absorbed;
    remainingDamage -= absorbed;
  }

  if (remainingDamage <= 0) {
    return 0;
  }

  const previousHp = tank.currentHp;
  tank.currentHp = Math.max(0, tank.currentHp - remainingDamage);
  tank.alive = tank.currentHp > 0;

  return previousHp - tank.currentHp;
}

function applyRewards(
  owner: TankState,
  target: TankState,
  hpDamage: number,
  destroyed: boolean
): void {
  if (owner.id === target.id) {
    return;
  }

  const reward = Math.max(
    1,
    Math.floor(hpDamage / ECONOMY.damageChunkSize) * ECONOMY.rewardPerDamageChunk
  );

  if (owner.teamId === target.teamId) {
    owner.score -= reward;
    return;
  }

  owner.money += reward;
  owner.score += reward;

  if (destroyed) {
    owner.money += reward;
    owner.score += reward;
  }
}

function findTankCollision(
  match: MatchState,
  projectile: ProjectileState
): TankState | null {
  for (const tank of match.tanks) {
    if (!tank.alive) {
      continue;
    }

    if (Math.hypot(tank.x - projectile.x, tank.y - projectile.y) <= TANK_HIT_RADIUS) {
      return tank;
    }
  }

  return null;
}

function findNextAliveTankIndex(
  match: MatchState,
  currentIndex: number
): number | null {
  for (let offset = 1; offset <= match.tanks.length; offset += 1) {
    const index = (currentIndex + offset) % match.tanks.length;

    if (match.tanks[index].alive) {
      return index;
    }
  }

  return null;
}

function updateExplosions(match: MatchState, deltaSeconds: number): void {
  match.explosions = match.explosions
    .map((explosion) => ({
      ...explosion,
      ttl: explosion.ttl - deltaSeconds
    }))
    .filter((explosion) => explosion.ttl > 0);
}

function updateAirStrikeRun(match: MatchState, deltaSeconds: number): void {
  if (!match.airStrikeRun) {
    return;
  }

  match.airStrikeRun.elapsed += deltaSeconds;

  if (
    match.airStrikeRun.elapsed >= match.airStrikeRun.duration + 0.05 ||
    (match.phase !== "resolving" && match.projectiles.length === 0)
  ) {
    match.airStrikeRun = null;
  }
}

function hasWeaponAmmo(tank: TankState, weaponId: WeaponId): boolean {
  return tank.weaponInventory[weaponId] === -1 || tank.weaponInventory[weaponId] > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
