import { createFreshPersistentState } from "../content/definitions";
import type {
  SaveFileV1,
  SessionRosterTank,
  TankProfile
} from "../core/types";

const STORAGE_KEY = "tanks-2026.save.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function createEmptySaveFile(): SaveFileV1 {
  return {
    version: 1,
    profiles: []
  };
}

export function loadSaveFile(storage = getBrowserStorage()): SaveFileV1 {
  if (!storage) {
    return createEmptySaveFile();
  }

  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    return createEmptySaveFile();
  }

  return parseSaveFile(raw);
}

export function saveSaveFile(
  saveFile: SaveFileV1,
  storage = getBrowserStorage()
): void {
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(saveFile));
}

export function parseSaveFile(raw: string): SaveFileV1 {
  try {
    const parsed = JSON.parse(raw) as Partial<SaveFileV1> | null;

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.profiles)) {
      return createEmptySaveFile();
    }

    return {
      version: 1,
      profiles: parsed.profiles
        .map((profile) => sanitizeProfile(profile))
        .filter((profile): profile is TankProfile => profile !== null)
    };
  } catch {
    return createEmptySaveFile();
  }
}

export function upsertProfile(
  saveFile: SaveFileV1,
  profile: TankProfile
): SaveFileV1 {
  const existingIndex = saveFile.profiles.findIndex(
    (candidate) => candidate.id === profile.id
  );
  const profiles = [...saveFile.profiles];

  if (existingIndex >= 0) {
    profiles[existingIndex] = profile;
  } else {
    profiles.push(profile);
  }

  return {
    version: 1,
    profiles
  };
}

export function deleteProfile(
  saveFile: SaveFileV1,
  profileId: string
): SaveFileV1 {
  return {
    version: 1,
    profiles: saveFile.profiles.filter((profile) => profile.id !== profileId)
  };
}

export function buildProfileFromRosterTank(
  tank: SessionRosterTank,
  existingProfile: TankProfile | null
): TankProfile {
  const now = new Date().toISOString();

  return {
    id: existingProfile?.id ?? createId(),
    displayName: tank.displayName,
    color: tank.color,
    version: 1,
    createdAt: existingProfile?.createdAt ?? now,
    updatedAt: now,
    money: tank.money,
    score: tank.score,
    weaponInventory: { ...tank.weaponInventory },
    itemInventory: { ...tank.itemInventory },
    upgrades: { ...tank.upgrades },
    shieldHp: tank.shieldHp
  };
}

export function createProfilePreview(
  displayName: string,
  color: string
): TankProfile {
  const now = new Date().toISOString();
  const persistent = createFreshPersistentState();

  return {
    id: createId(),
    displayName,
    color,
    version: 1,
    createdAt: now,
    updatedAt: now,
    money: persistent.money,
    score: persistent.score,
    weaponInventory: { ...persistent.weaponInventory },
    itemInventory: { ...persistent.itemInventory },
    upgrades: { ...persistent.upgrades },
    shieldHp: persistent.shieldHp
  };
}

function sanitizeProfile(raw: unknown): TankProfile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<TankProfile>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.displayName !== "string" ||
    typeof candidate.color !== "string" ||
    typeof candidate.money !== "number" ||
    typeof candidate.score !== "number" ||
    typeof candidate.shieldHp !== "number" ||
    !candidate.weaponInventory ||
    !candidate.itemInventory ||
    !candidate.upgrades
  ) {
    return null;
  }

  return {
    id: candidate.id,
    displayName: candidate.displayName,
    color: candidate.color,
    version: 1,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    money: candidate.money,
    score: candidate.score,
    weaponInventory: { ...candidate.weaponInventory },
    itemInventory: { ...candidate.itemInventory },
    upgrades: { ...candidate.upgrades },
    shieldHp: candidate.shieldHp
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `profile-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}
