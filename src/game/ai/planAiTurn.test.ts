import assert from "node:assert/strict";
import test from "node:test";
import { createFreshPersistentState } from "../content/definitions";
import { createSession, startNextRound } from "../core/session";
import { planAiTurn } from "./planAiTurn";
import type { ControllerType, MatchConfig } from "../core/types";

test("AI tank returns a non-empty plan", () => {
  const match = createPlanningMatch("ai");

  const commands = planAiTurn(match);

  assert.ok(commands.length > 0);
  assert.ok(
    commands.some(
      (command) =>
        command.type === "fire" ||
        command.type === "teleport" ||
        command.type === "declareDraw"
    )
  );
});

test("human-controlled tank returns no AI plan", () => {
  const match = createPlanningMatch("human");

  assert.deepEqual(planAiTurn(match), []);
});

function createPlanningMatch(activeController: ControllerType) {
  const config: MatchConfig = {
    roundLimit: 1,
    teamMode: false,
    weatherPreset: "breezy",
    seed: 24680,
    tanks: [
      {
        id: "alpha",
        displayName: "Alpha",
        color: "#f97316",
        controller: activeController,
        aiDifficulty: "medium",
        teamId: "solo-1",
        profileId: null,
        ...createFreshPersistentState()
      },
      {
        id: "bravo",
        displayName: "Bravo",
        color: "#3b82f6",
        controller: activeController === "ai" ? "human" : "ai",
        aiDifficulty: "medium",
        teamId: "solo-2",
        profileId: null,
        ...createFreshPersistentState()
      }
    ]
  };
  const session = createSession(config);
  const match = startNextRound(session);

  match.wind.force = 0;
  match.activeTankIndex = 0;

  return match;
}
