import {
  DEFAULT_ANGLE,
  DEFAULT_ARENA_HEIGHT,
  DEFAULT_ARENA_WIDTH,
  DEFAULT_POWER,
  DEFAULT_ROUND_LIMIT,
  POWER_MAX,
  POWER_MIN,
  RANDOM_WEATHER_OPTIONS,
  WEATHER_PRESETS
} from "../content/definitions";
import {
  ECONOMY,
  ITEMS,
  UPGRADES,
  WEAPONS,
  createFreshPersistentState,
  getMaxHp,
  getRoundFuel
} from "../content/definitions";
import { createSeededRandom, randomBetween } from "./random";
import {
  createTerrain,
  generateSpawnXs,
  resolveSurfaceInfo
} from "./terrain";
import type {
  ConfiguredTank,
  ItemId,
  MatchConfig,
  MatchSession,
  MatchSetupState,
  MatchState,
  RoundSummary,
  SaveFileV1,
  SessionRosterTank,
  TankProfile,
  TankSetupSlot,
  TankState,
  UpgradeId,
  WeaponId
} from "./types";

const SLOT_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#e879f9"];

export function createDefaultSetupState(): MatchSetupState {
  return {
    tankCount: 2,
    teamMode: false,
    roundLimit: DEFAULT_ROUND_LIMIT,
    weatherPreset: "breezy",
    slots: Array.from({ length: 4 }, (_, index) => createDefaultSlot(index))
  };
}

export function buildMatchConfig(
  setup: MatchSetupState,
  saveFile: SaveFileV1
): MatchConfig {
  const activeSlots = setup.slots.filter((slot) => slot.enabled).slice(0, setup.tankCount);
  const tanks: ConfiguredTank[] = activeSlots.map((slot, index) => {
    const profile = slot.selectedProfileId
      ? saveFile.profiles.find((candidate) => candidate.id === slot.selectedProfileId) ?? null
      : null;
    const persistent = profile ? persistentFromProfile(profile) : createFreshPersistentState();

    return {
      id: slot.id,
      displayName: profile?.displayName ?? slot.displayName,
      color: profile?.color ?? slot.color,
      controller: slot.controller,
      aiDifficulty: slot.aiDifficulty,
      teamId: setup.teamMode ? slot.teamId : `solo-${index + 1}`,
      profileId: profile?.id ?? null,
      money: persistent.money,
      score: persistent.score,
      weaponInventory: { ...persistent.weaponInventory },
      itemInventory: { ...persistent.itemInventory },
      upgrades: { ...persistent.upgrades },
      shieldHp: persistent.shieldHp
    };
  });

  return {
    roundLimit: setup.roundLimit,
    teamMode: setup.teamMode,
    weatherPreset: setup.weatherPreset,
    seed: Date.now() >>> 0,
    tanks
  };
}

export function createSession(config: MatchConfig): MatchSession {
  const roster = config.tanks.map<SessionRosterTank>((tank) => ({
    ...tank,
    roundsWon: 0,
    totalDamageDealt: 0
  }));

  return {
    config,
    roster,
    roundIndex: 0,
    currentRound: null,
    roundHistory: []
  };
}

export function startNextRound(session: MatchSession): MatchState {
  const roundNumber = session.roundIndex + 1;
  const roundSeed = (session.config.seed + roundNumber * 4099) >>> 0;
  const random = createSeededRandom(roundSeed ^ 0xbac0ffee);
  const spawnXs = generateSpawnXs(
    session.roster.length,
    DEFAULT_ARENA_WIDTH,
    roundSeed ^ 0x17f83d4b
  );
  const terrain = createTerrain(roundSeed, spawnXs);
  const tanks = session.roster.map((tank, index) =>
    createRoundTankState(tank, spawnXs[index], terrain, DEFAULT_ARENA_WIDTH)
  );
  const weather =
    session.config.weatherPreset === "random"
      ? WEATHER_PRESETS[
          RANDOM_WEATHER_OPTIONS[
            Math.floor(random() * RANDOM_WEATHER_OPTIONS.length)
          ]
        ]
      : WEATHER_PRESETS[session.config.weatherPreset];

  const match: MatchState = {
    roundNumber,
    phase: "command",
    seed: roundSeed,
    arenaWidth: DEFAULT_ARENA_WIDTH,
    arenaHeight: DEFAULT_ARENA_HEIGHT,
    terrain,
    wind: {
      force: randomBetween(random, weather.minWind, weather.maxWind)
    },
    tanks,
    activeTankIndex: roundNumber % tanks.length,
    turnNumber: 1,
    projectiles: [],
    explosions: [],
    outcome: null,
    announcement: `${tanks[roundNumber % tanks.length].displayName} to act`
  };

  session.roundIndex = roundNumber;
  session.currentRound = match;

  return match;
}

export function mergeRoundIntoSession(session: MatchSession): RoundSummary {
  if (!session.currentRound || !session.currentRound.outcome) {
    throw new Error("Cannot merge a round that has not ended.");
  }

  const round = session.currentRound;
  const outcome = round.outcome!;
  const winners = new Set<string>();

  if (outcome.winningTeamId) {
    for (const tank of round.tanks) {
      if (tank.teamId === outcome.winningTeamId) {
        winners.add(tank.id);
      }
    }
  } else if (outcome.winningTankId) {
    winners.add(outcome.winningTankId);
  }

  const summary: RoundSummary = {
    roundNumber: round.roundNumber,
    outcome,
    tanks: round.tanks.map((tank) => ({
      id: tank.id,
      displayName: tank.displayName,
      money: tank.money,
      score: tank.score,
      remainingShieldHp: tank.shieldHp,
      wasAliveAtEnd: tank.alive,
      damageDealt: tank.damageDealtThisRound
    }))
  };

  session.roster = session.roster.map((rosterTank) => {
    const roundTank = round.tanks.find((candidate) => candidate.id === rosterTank.id);

    if (!roundTank) {
      return rosterTank;
    }

    return {
      ...rosterTank,
      money: roundTank.money,
      score: roundTank.score,
      weaponInventory: { ...roundTank.weaponInventory },
      itemInventory: { ...roundTank.itemInventory },
      upgrades: { ...roundTank.upgrades },
      shieldHp: roundTank.shieldHp,
      roundsWon: rosterTank.roundsWon + (winners.has(rosterTank.id) ? 1 : 0),
      totalDamageDealt: rosterTank.totalDamageDealt + roundTank.damageDealtThisRound
    };
  });

  session.roundHistory = [...session.roundHistory, summary];
  session.currentRound = null;

  return summary;
}

export function canStartAnotherRound(session: MatchSession): boolean {
  return session.roundIndex < session.config.roundLimit;
}

export function purchaseWeapon(
  session: MatchSession,
  tankId: string,
  weaponId: Exclude<WeaponId, "basicShell">
): string {
  const tank = session.roster.find((candidate) => candidate.id === tankId);
  const weapon = WEAPONS[weaponId];

  if (!tank) {
    return "Tank not found.";
  }

  if (tank.money < weapon.cost) {
    return "Not enough money.";
  }

  tank.money -= weapon.cost;
  tank.weaponInventory[weaponId] += 1;

  return `${tank.displayName} bought ${weapon.name}.`;
}

export function purchaseItem(
  session: MatchSession,
  tankId: string,
  itemId: ItemId
): string {
  const tank = session.roster.find((candidate) => candidate.id === tankId);
  const item = ITEMS[itemId];

  if (!tank) {
    return "Tank not found.";
  }

  if (tank.money < item.cost) {
    return "Not enough money.";
  }

  tank.money -= item.cost;
  tank.itemInventory[itemId] += 1;

  return `${tank.displayName} bought ${item.name}.`;
}

export function purchaseUpgrade(
  session: MatchSession,
  tankId: string,
  upgradeId: UpgradeId
): string {
  const tank = session.roster.find((candidate) => candidate.id === tankId);
  const upgrade = UPGRADES[upgradeId];

  if (!tank) {
    return "Tank not found.";
  }

  if (tank.upgrades[upgradeId] >= upgrade.maxLevel) {
    return `${upgrade.name} is already maxed.`;
  }

  const currentCost = upgrade.cost + tank.upgrades[upgradeId] * 4;

  if (tank.money < currentCost) {
    return "Not enough money.";
  }

  tank.money -= currentCost;
  tank.upgrades[upgradeId] += 1;

  return `${tank.displayName} upgraded ${upgrade.name}.`;
}

export function buildProfileFromRosterTank(
  tank: SessionRosterTank,
  existing: TankProfile | null
): TankProfile {
  const now = new Date().toISOString();

  return {
    id: existing?.id ?? createId("profile"),
    displayName: tank.displayName,
    color: tank.color,
    version: 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    money: tank.money,
    score: tank.score,
    weaponInventory: { ...tank.weaponInventory },
    itemInventory: { ...tank.itemInventory },
    upgrades: { ...tank.upgrades },
    shieldHp: tank.shieldHp
  };
}

function createDefaultSlot(index: number): TankSetupSlot {
  return {
    id: `slot-${index + 1}`,
    enabled: index < 2,
    displayName: `Tank ${index + 1}`,
    color: SLOT_COLORS[index],
    controller: "human",
    aiDifficulty: "medium",
    teamId: index % 2 === 0 ? "red" : "blue",
    selectedProfileId: null
  };
}

function createRoundTankState(
  tank: SessionRosterTank,
  spawnX: number,
  terrain: MatchState["terrain"],
  arenaWidth: number
): TankState {
  const surface = resolveSurfaceInfo(terrain, spawnX);
  const angleDeg = spawnX < arenaWidth / 2 ? DEFAULT_ANGLE : 180 - DEFAULT_ANGLE;

  return {
    ...tank,
    x: surface.x,
    y: surface.y,
    tiltDeg: surface.tiltDeg,
    currentHp: getMaxHp(tank.upgrades),
    maxHp: getMaxHp(tank.upgrades),
    currentFuel: getRoundFuel(tank.upgrades),
    baseFuel: getRoundFuel(tank.upgrades),
    angleDeg,
    power: clamp(DEFAULT_POWER, POWER_MIN, POWER_MAX),
    selectedWeaponId: pickFirstAvailableWeapon(tank.weaponInventory),
    alive: true,
    damageDealtThisRound: 0
  };
}

function pickFirstAvailableWeapon(
  inventory: SessionRosterTank["weaponInventory"]
): WeaponId {
  if (inventory.multiShot > 0) {
    return "multiShot";
  }

  if (inventory.heavyShell > 0) {
    return "heavyShell";
  }

  if (inventory.airStrike > 0) {
    return "airStrike";
  }

  return "basicShell";
}

function persistentFromProfile(profile: TankProfile) {
  return {
    money: profile.money,
    score: profile.score,
    weaponInventory: { ...profile.weaponInventory },
    itemInventory: { ...profile.itemInventory },
    upgrades: { ...profile.upgrades },
    shieldHp: profile.shieldHp
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export { ECONOMY };
