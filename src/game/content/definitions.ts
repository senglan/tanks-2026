import type {
  EconomyDefaults,
  InventoryRecord,
  ItemDefinition,
  ItemId,
  PersistentTankState,
  UpgradeDefinition,
  UpgradeId,
  WeatherPreset,
  WeaponDefinition,
  WeaponId
} from "../core/types";

export const DEFAULT_ROUND_LIMIT = 3;
export const DEFAULT_ARENA_WIDTH = 140;
export const DEFAULT_ARENA_HEIGHT = 54;
export const DEFAULT_TERRAIN_SAMPLES = 160;
export const DEFAULT_BASE_HP = 100;
export const DEFAULT_BASE_FUEL = 40;
export const DEFAULT_POWER = 52;
export const DEFAULT_ANGLE = 55;
export const FIXED_STEP_SECONDS = 1 / 60;
export const TANK_HALF_WIDTH = 1.75;
export const TANK_BODY_HEIGHT = 1.3;
export const TANK_TURRET_LENGTH = 2.2;
export const MAX_TILT_DEGREES = 22;
export const MAX_CLIMB_SLOPE = 0.8;
export const MOVE_STEP_DISTANCE = 0.6;
export const MOVE_FUEL_COST = 1;
export const ANGLE_STEP = 1.5;
export const POWER_STEP = 1.8;
export const POWER_MIN = 24;
export const POWER_MAX = 86;
export const ANGLE_MIN = 10;
export const ANGLE_MAX = 170;
export const TELEPORT_ITEM_HP = 0;
export const SHIELD_ITEM_HP = 28;
export const REPAIR_ITEM_HP = 24;
export const WIND_MIN = -12;
export const WIND_MAX = 12;
export const AIRSTRIKE_SPAWN_HEIGHT = DEFAULT_ARENA_HEIGHT - 6;

export const WEATHER_PRESETS: Record<
  WeatherPreset,
  {
    id: WeatherPreset;
    label: string;
    minWind: number;
    maxWind: number;
  }
> = {
  random: {
    id: "random",
    label: "Random",
    minWind: 0,
    maxWind: 0
  },
  calm: {
    id: "calm",
    label: "Calm",
    minWind: -2.5,
    maxWind: 2.5
  },
  breezy: {
    id: "breezy",
    label: "Breezy",
    minWind: -5,
    maxWind: 5
  },
  gusty: {
    id: "gusty",
    label: "Gusty",
    minWind: -8,
    maxWind: 8
  },
  wild: {
    id: "wild",
    label: "Wild",
    minWind: WIND_MIN,
    maxWind: WIND_MAX
  }
};

export const RANDOM_WEATHER_OPTIONS: Exclude<WeatherPreset, "random">[] = [
  "calm",
  "breezy",
  "gusty",
  "wild"
];

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  basicShell: {
    id: "basicShell",
    name: "Basic Shell",
    description: "Balanced shell with steady blast damage.",
    cost: 0,
    targeted: false,
    projectileCount: 1,
    projectileDelay: 0,
    spreadDeg: 0,
    damage: 30,
    splashRadius: 4.5,
    terrainRadius: 4.75,
    terrainDepth: 3.8,
    muzzleVelocity: 48,
    blastColor: "#ffbe63"
  },
  heavyShell: {
    id: "heavyShell",
    name: "Heavy Shell",
    description: "Harder hit with a slightly tighter blast.",
    cost: 6,
    targeted: false,
    projectileCount: 1,
    projectileDelay: 0,
    spreadDeg: 0,
    damage: 44,
    splashRadius: 4,
    terrainRadius: 5.25,
    terrainDepth: 4.2,
    muzzleVelocity: 52,
    blastColor: "#ff8458"
  },
  multiShot: {
    id: "multiShot",
    name: "Multi Shot",
    description: "Three lighter shots with mild spread.",
    cost: 9,
    targeted: false,
    projectileCount: 3,
    projectileDelay: 0.08,
    spreadDeg: 6,
    damage: 16,
    splashRadius: 3.25,
    terrainRadius: 3.1,
    terrainDepth: 2.4,
    muzzleVelocity: 47,
    blastColor: "#ffe082"
  },
  airStrike: {
    id: "airStrike",
    name: "Air Strike",
    description: "A late-game targeted barrage from above.",
    cost: 14,
    targeted: true,
    projectileCount: 5,
    projectileDelay: 0.14,
    spreadDeg: 0,
    damage: 14,
    splashRadius: 3.8,
    terrainRadius: 3.8,
    terrainDepth: 2.6,
    muzzleVelocity: 20,
    blastColor: "#f44747"
  }
};

export const ITEMS: Record<ItemId, ItemDefinition> = {
  shield: {
    id: "shield",
    name: "Shield",
    description: "Adds a fresh shield layer without ending the turn.",
    cost: 10
  },
  repairKit: {
    id: "repairKit",
    name: "Repair Kit",
    description: "Restore HP immediately without ending the turn.",
    cost: 8
  },
  teleport: {
    id: "teleport",
    name: "Teleport",
    description: "Choose a new landing point and end the turn.",
    cost: 12
  }
};

export const UPGRADES: Record<UpgradeId, UpgradeDefinition> = {
  armor: {
    id: "armor",
    name: "Armor",
    description: "Adds max HP every round.",
    cost: 18,
    maxLevel: 3
  },
  engineEfficiency: {
    id: "engineEfficiency",
    name: "Engine",
    description: "Improves movement distance per fuel spent.",
    cost: 16,
    maxLevel: 3
  },
  startingFuel: {
    id: "startingFuel",
    name: "Fuel",
    description: "Raises fuel available at the start of each round.",
    cost: 14,
    maxLevel: 3
  }
};

export const ECONOMY: EconomyDefaults = {
  startingMoney: 10,
  drawBonus: 5,
  rewardPerDamageChunk: 1,
  damageChunkSize: 10
};

export const WEAPON_ORDER: WeaponId[] = [
  "basicShell",
  "heavyShell",
  "multiShot",
  "airStrike"
];

export const ITEM_ORDER: ItemId[] = ["shield", "repairKit", "teleport"];
export const UPGRADE_ORDER: UpgradeId[] = [
  "armor",
  "engineEfficiency",
  "startingFuel"
];

export function createEmptyWeaponInventory(): InventoryRecord<WeaponId> {
  return {
    basicShell: -1,
    heavyShell: 0,
    multiShot: 0,
    airStrike: 0
  };
}

export function createEmptyItemInventory(): InventoryRecord<ItemId> {
  return {
    shield: 0,
    repairKit: 0,
    teleport: 0
  };
}

export function createEmptyUpgrades(): InventoryRecord<UpgradeId> {
  return {
    armor: 0,
    engineEfficiency: 0,
    startingFuel: 0
  };
}

export function createFreshPersistentState(): PersistentTankState {
  return {
    money: ECONOMY.startingMoney,
    score: 0,
    weaponInventory: createEmptyWeaponInventory(),
    itemInventory: createEmptyItemInventory(),
    upgrades: createEmptyUpgrades(),
    shieldHp: 0
  };
}

export function getMaxHp(upgrades: InventoryRecord<UpgradeId>): number {
  return DEFAULT_BASE_HP + upgrades.armor * 15;
}

export function getRoundFuel(upgrades: InventoryRecord<UpgradeId>): number {
  return DEFAULT_BASE_FUEL + upgrades.startingFuel * 10;
}

export function getEngineMoveMultiplier(
  upgrades: InventoryRecord<UpgradeId>
): number {
  return 1 + upgrades.engineEfficiency * 0.18;
}
