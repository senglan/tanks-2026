import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXED_STEP_SECONDS,
  TANK_BODY_HEIGHT,
  createFreshPersistentState
} from "../content/definitions";
import { createSession, startNextRound } from "./session";
import { applyCommand, stepMatch } from "./simulation";
import type { MatchConfig } from "./types";

test("teleport consumes the item and ends the turn immediately", () => {
  const match = createTestMatch(false);
  const startingX = match.tanks[0].x;

  match.tanks[0].itemInventory.teleport = 1;
  match.activeTankIndex = 0;

  const message = applyCommand(match, { type: "teleport", targetX: 88 });

  assert.equal(message, `${match.tanks[1].displayName} to act`);
  assert.equal(match.phase, "command");
  assert.equal(match.activeTankIndex, 1);
  assert.equal(match.tanks[0].itemInventory.teleport, 0);
  assert.notEqual(match.tanks[0].x, startingX);
});

test("enemy damage grants money and score", () => {
  const match = createTestMatch(false);
  const attacker = match.tanks[0];
  const defender = match.tanks[1];
  const initialMoney = attacker.money;
  const initialScore = attacker.score;

  attacker.weaponInventory.airStrike = 1;
  attacker.selectedWeaponId = "airStrike";
  match.activeTankIndex = 0;

  applyCommand(match, { type: "fire", targetX: defender.x });
  runUntilResolved(match);

  assert.ok(defender.currentHp < defender.maxHp);
  assert.ok(attacker.money > initialMoney);
  assert.ok(attacker.score > initialScore);
});

test("friendly fire gives no money and reduces score", () => {
  const match = createTestMatch(true);
  const attacker = match.tanks[0];
  const teammate = match.tanks[1];
  const initialMoney = attacker.money;
  const initialScore = attacker.score;

  attacker.weaponInventory.airStrike = 1;
  attacker.selectedWeaponId = "airStrike";
  match.activeTankIndex = 0;

  applyCommand(match, { type: "fire", targetX: teammate.x });
  runUntilResolved(match);

  assert.ok(teammate.currentHp < teammate.maxHp);
  assert.equal(attacker.money, initialMoney);
  assert.ok(attacker.score < initialScore);
});

test("explosions continue decaying during command phase", () => {
  const match = createTestMatch(false);
  match.phase = "command";
  match.explosions = [
    {
      id: "test-explosion",
      x: 40,
      y: 12,
      radius: 4,
      ttl: 0.2
    }
  ];

  stepMatch(match, FIXED_STEP_SECONDS);

  assert.equal(match.explosions.length, 1);
  assert.ok(match.explosions[0].ttl < 0.2);

  for (let index = 0; index < 20; index += 1) {
    stepMatch(match, FIXED_STEP_SECONDS);
  }

  assert.equal(match.explosions.length, 0);
});

test("steep shots can travel above the arena without triggering a ceiling hit", () => {
  const match = createTestMatch(false);
  const attacker = match.tanks[0];

  attacker.angleDeg = 89;
  attacker.power = 86;
  match.tanks[1].x = 132;

  applyCommand(match, { type: "fire" });

  let highestY = Number.NEGATIVE_INFINITY;
  let safety = 0;

  while (match.projectiles.length > 0 && safety < 240) {
    stepMatch(match, FIXED_STEP_SECONDS);
    const projectile = match.projectiles[0];

    if (projectile) {
      highestY = Math.max(highestY, projectile.y);

      if (projectile.y > match.arenaHeight + 10) {
        break;
      }
    }

    safety += 1;
  }

  assert.ok(highestY > match.arenaHeight + 10);
  assert.equal(match.phase, "resolving");
  assert.equal(match.projectiles.length, 1);
  assert.equal(match.explosions.length, 0);
});

function createTestMatch(teamMode: boolean) {
  const persistentA = createFreshPersistentState();
  const persistentB = createFreshPersistentState();
  const config: MatchConfig = {
    roundLimit: 1,
    teamMode,
    weatherPreset: "breezy",
    seed: 12345,
    tanks: [
      {
        id: "a",
        displayName: "Alpha",
        color: "#f97316",
        controller: "human",
        aiDifficulty: "medium",
        teamId: teamMode ? "red" : "solo-1",
        profileId: null,
        ...persistentA
      },
      {
        id: "b",
        displayName: "Bravo",
        color: "#3b82f6",
        controller: "human",
        aiDifficulty: "medium",
        teamId: teamMode ? "red" : "solo-2",
        profileId: null,
        ...persistentB
      }
    ]
  };
  const session = createSession(config);
  const match = startNextRound(session);

  match.wind.force = 0;
  match.activeTankIndex = 0;

  for (const sampleIndex in match.terrain.samples) {
    match.terrain.samples[sampleIndex] = 10;
  }

  match.tanks[0].x = 28;
  match.tanks[0].y = 10 + TANK_BODY_HEIGHT / 2;
  match.tanks[0].tiltDeg = 0;
  match.tanks[1].x = 96;
  match.tanks[1].y = 10 + TANK_BODY_HEIGHT / 2;
  match.tanks[1].tiltDeg = 0;

  return match;
}

function runUntilResolved(match: ReturnType<typeof createTestMatch>): void {
  let safety = 0;

  while (match.phase === "resolving" && safety < 960) {
    stepMatch(match, FIXED_STEP_SECONDS);
    safety += 1;
  }

  assert.ok(safety < 960);
}
