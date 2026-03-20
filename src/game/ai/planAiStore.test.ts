import assert from "node:assert/strict";
import test from "node:test";
import { createFreshPersistentState } from "../content/definitions";
import { createSession } from "../core/session";
import { planAiStoreActions } from "./planAiStore";
import type { MatchConfig } from "../core/types";

test("early-round AI store planning follows the fixed priority order", () => {
  const session = createAiStoreSession(72, 1);

  assert.deepEqual(planAiStoreActions(session, "ai-1"), [
    { type: "purchaseItem", tankId: "ai-1", itemId: "shield" },
    { type: "purchaseUpgrade", tankId: "ai-1", upgradeId: "armor" },
    { type: "purchaseUpgrade", tankId: "ai-1", upgradeId: "engineEfficiency" },
    { type: "purchaseUpgrade", tankId: "ai-1", upgradeId: "startingFuel" },
    { type: "purchaseWeapon", tankId: "ai-1", weaponId: "heavyShell" },
    { type: "purchaseItem", tankId: "ai-1", itemId: "repairKit" }
  ]);
});

test("late-round AI store planning includes multi-shot, teleport, and air strike", () => {
  const session = createAiStoreSession(111, 3);

  assert.deepEqual(planAiStoreActions(session, "ai-1"), [
    { type: "purchaseItem", tankId: "ai-1", itemId: "shield" },
    { type: "purchaseUpgrade", tankId: "ai-1", upgradeId: "armor" },
    { type: "purchaseUpgrade", tankId: "ai-1", upgradeId: "engineEfficiency" },
    { type: "purchaseUpgrade", tankId: "ai-1", upgradeId: "startingFuel" },
    { type: "purchaseWeapon", tankId: "ai-1", weaponId: "heavyShell" },
    { type: "purchaseItem", tankId: "ai-1", itemId: "repairKit" },
    { type: "purchaseWeapon", tankId: "ai-1", weaponId: "multiShot" },
    { type: "purchaseItem", tankId: "ai-1", itemId: "teleport" },
    { type: "purchaseWeapon", tankId: "ai-1", weaponId: "airStrike" }
  ]);
});

test("AI store planning stops when nothing is affordable", () => {
  const session = createAiStoreSession(3, 3);

  assert.deepEqual(planAiStoreActions(session, "ai-1"), []);
});

function createAiStoreSession(money: number, roundIndex: number) {
  const persistent = createFreshPersistentState();
  persistent.money = money;

  const config: MatchConfig = {
    roundLimit: 3,
    teamMode: false,
    weatherPreset: "breezy",
    seed: 13579,
    tanks: [
      {
        id: "ai-1",
        displayName: "Alpha",
        color: "#f97316",
        controller: "ai",
        aiDifficulty: "medium",
        teamId: "solo-1",
        profileId: null,
        ...persistent
      }
    ]
  };
  const session = createSession(config);
  session.roundIndex = roundIndex;

  return session;
}
