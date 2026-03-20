export type AppScreen =
  | "mainMenu"
  | "matchSetup"
  | "profiles"
  | "match"
  | "roundSummary"
  | "store"
  | "matchSummary";

export type ControllerType = "human" | "ai";
export type AiDifficulty = "easy" | "medium" | "hard";
export type WeatherPreset = "random" | "calm" | "breezy" | "gusty" | "wild";

export type WeaponId = "basicShell" | "heavyShell" | "multiShot" | "airStrike";
export type ItemId = "shield" | "repairKit" | "teleport";
export type UpgradeId = "armor" | "engineEfficiency" | "startingFuel";

export type InventoryRecord<T extends string> = Record<T, number>;

export interface PersistentTankState {
  money: number;
  score: number;
  weaponInventory: InventoryRecord<WeaponId>;
  itemInventory: InventoryRecord<ItemId>;
  upgrades: InventoryRecord<UpgradeId>;
  shieldHp: number;
}

export interface TankProfile extends PersistentTankState {
  id: string;
  displayName: string;
  color: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
}

export interface SaveFileV1 {
  version: 1;
  profiles: TankProfile[];
}

export interface TankSetupSlot {
  id: string;
  enabled: boolean;
  displayName: string;
  color: string;
  controller: ControllerType;
  aiDifficulty: AiDifficulty;
  teamId: string;
  selectedProfileId: string | null;
}

export interface MatchSetupState {
  tankCount: 2 | 3 | 4;
  teamMode: boolean;
  roundLimit: number;
  weatherPreset: WeatherPreset;
  slots: TankSetupSlot[];
}

export interface ConfiguredTank extends PersistentTankState {
  id: string;
  displayName: string;
  color: string;
  controller: ControllerType;
  aiDifficulty: AiDifficulty;
  teamId: string;
  profileId: string | null;
}

export interface MatchConfig {
  roundLimit: number;
  teamMode: boolean;
  weatherPreset: WeatherPreset;
  seed: number;
  tanks: ConfiguredTank[];
}

export interface SessionRosterTank extends ConfiguredTank {
  roundsWon: number;
  totalDamageDealt: number;
}

export interface MatchSession {
  config: MatchConfig;
  roster: SessionRosterTank[];
  roundIndex: number;
  currentRound: MatchState | null;
  roundHistory: RoundSummary[];
}

export interface TerrainState {
  width: number;
  height: number;
  floor: number;
  sampleSpacing: number;
  samples: number[];
  revision: number;
}

export interface WindState {
  force: number;
}

export interface TankState extends PersistentTankState {
  id: string;
  profileId: string | null;
  displayName: string;
  color: string;
  controller: ControllerType;
  aiDifficulty: AiDifficulty;
  teamId: string;
  x: number;
  y: number;
  tiltDeg: number;
  currentHp: number;
  maxHp: number;
  currentFuel: number;
  baseFuel: number;
  angleDeg: number;
  power: number;
  selectedWeaponId: WeaponId;
  alive: boolean;
  damageDealtThisRound: number;
}

export interface ProjectileState {
  id: string;
  ownerTankId: string;
  ownerTeamId: string;
  weaponId: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  splashRadius: number;
  terrainRadius: number;
  terrainDepth: number;
  spawnDelay: number;
}

export interface ExplosionState {
  id: string;
  x: number;
  y: number;
  radius: number;
  ttl: number;
}

export interface RoundOutcome {
  kind: "victory" | "draw";
  winningTeamId: string | null;
  winningTankId: string | null;
  reason: string;
}

export interface RoundSummaryTank {
  id: string;
  displayName: string;
  money: number;
  score: number;
  remainingShieldHp: number;
  wasAliveAtEnd: boolean;
  damageDealt: number;
}

export interface RoundSummary {
  roundNumber: number;
  outcome: RoundOutcome;
  tanks: RoundSummaryTank[];
}

export type MatchPhase = "command" | "resolving" | "roundOver";

export interface MatchState {
  roundNumber: number;
  phase: MatchPhase;
  seed: number;
  arenaWidth: number;
  arenaHeight: number;
  terrain: TerrainState;
  wind: WindState;
  tanks: TankState[];
  activeTankIndex: number;
  turnNumber: number;
  projectiles: ProjectileState[];
  explosions: ExplosionState[];
  outcome: RoundOutcome | null;
  announcement: string;
}

export type MatchCommand =
  | { type: "move"; direction: -1 | 1 }
  | { type: "adjustAngle"; delta: number }
  | { type: "adjustPower"; delta: number }
  | { type: "cycleWeapon"; direction: -1 | 1 }
  | { type: "selectWeapon"; weaponId: WeaponId }
  | { type: "useItem"; itemId: "shield" | "repairKit" }
  | { type: "fire"; targetX?: number }
  | { type: "teleport"; targetX: number }
  | { type: "declareDraw" };

export type InputMode =
  | { kind: "normal" }
  | {
      kind: "targeting";
      action: "teleport" | "airStrike";
      ownerTankId: string;
    };

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  description: string;
  cost: number;
  targeted: boolean;
  projectileCount: number;
  projectileDelay: number;
  spreadDeg: number;
  damage: number;
  splashRadius: number;
  terrainRadius: number;
  terrainDepth: number;
  muzzleVelocity: number;
  blastColor: string;
}

export interface ItemDefinition {
  id: ItemId;
  name: string;
  description: string;
  cost: number;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
  maxLevel: number;
}

export interface EconomyDefaults {
  startingMoney: number;
  drawBonus: number;
  rewardPerDamageChunk: number;
  damageChunkSize: number;
}

export interface AppState {
  screen: AppScreen;
  setup: MatchSetupState;
  saveFile: SaveFileV1;
  session: MatchSession | null;
  inputMode: InputMode;
  message: string;
}

export interface TankHudState {
  id: string;
  displayName: string;
  teamId: string;
  money: number;
  score: number;
  alive: boolean;
  active: boolean;
}

export interface MatchViewState {
  roundNumber: number;
  roundLimit: number;
  announcement: string;
  inputModeLabel: string | null;
  activeTank: TankState | null;
  tanks: TankHudState[];
}
