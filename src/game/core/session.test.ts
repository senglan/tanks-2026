import assert from "node:assert/strict";
import test from "node:test";
import { createFreshPersistentState } from "../content/definitions";
import { buildMatchConfig, createDefaultSetupState, createSession, startNextRound } from "./session";
import type { MatchConfig } from "./types";

test("buildMatchConfig preserves controller and AI difficulty from setup", () => {
  const setup = createDefaultSetupState();

  setup.slots[0].controller = "ai";
  setup.slots[0].aiDifficulty = "hard";

  const config = buildMatchConfig(setup, {
    version: 1,
    profiles: []
  });

  assert.equal(config.tanks[0].controller, "ai");
  assert.equal(config.tanks[0].aiDifficulty, "hard");
});

test("startNextRound clamps round fuel to at least the base amount", () => {
  const persistent = createFreshPersistentState();
  const config: MatchConfig = {
    roundLimit: 1,
    teamMode: false,
    weatherPreset: "breezy",
    seed: 9988,
    tanks: [
      {
        id: "alpha",
        displayName: "Alpha",
        color: "#f97316",
        controller: "human",
        aiDifficulty: "medium",
        teamId: "solo-1",
        profileId: null,
        ...persistent,
        upgrades: {
          ...persistent.upgrades,
          startingFuel: -4
        }
      },
      {
        id: "bravo",
        displayName: "Bravo",
        color: "#3b82f6",
        controller: "human",
        aiDifficulty: "medium",
        teamId: "solo-2",
        profileId: null,
        ...persistent
      }
    ]
  };
  const session = createSession(config);
  const round = startNextRound(session);

  assert.equal(round.tanks[0].currentFuel, 40);
  assert.equal(round.tanks[0].baseFuel, 40);
});
