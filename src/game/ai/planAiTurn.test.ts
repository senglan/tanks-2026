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

test("AI does not fire away from the target on steep terrain seeds", () => {
  for (const seed of [54, 229, 447]) {
    const match = createPlanningMatch("human", {
      seed,
      activeTankIndex: 1
    });

    const commands = planAiTurn(match);
    const finalAngle = getPlannedAngle(match.tanks[1].angleDeg, commands);
    const horizontalDelta = match.tanks[0].x - match.tanks[1].x;

    assert.ok(
      commands.some((command) => command.type === "fire"),
      `Expected AI to fire for seed ${seed}.`
    );
    assert.equal(
      isShotHeadingAwayFromTarget(finalAngle, horizontalDelta),
      false,
      `Expected AI to avoid away-shot on seed ${seed}, got ${finalAngle.toFixed(2)} degrees.`
    );
  }
});

test("AI air strike command includes simulated accuracy metadata", () => {
  const match = createPlanningMatch("human", {
    activeTankIndex: 1,
    aiDifficulty: "medium"
  });
  prepareAirStrikeOnly(match, 1);

  const commands = planAiTurn(match);
  const fireCommand = commands.find((command) => command.type === "fire");

  assert.ok(fireCommand);
  assert.equal(fireCommand?.type, "fire");
  assert.equal(typeof fireCommand?.targetX, "number");
  assert.equal(typeof fireCommand?.airStrikeAccuracy, "number");
  assert.ok((fireCommand?.airStrikeAccuracy ?? 0) > 0);
});

test("AI difficulty changes simulated air strike accuracy profile", () => {
  const easyAverage = averageAiAirStrikeAccuracy("easy");
  const mediumAverage = averageAiAirStrikeAccuracy("medium");
  const hardAverage = averageAiAirStrikeAccuracy("hard");

  assert.ok(mediumAverage > easyAverage);
  assert.ok(hardAverage > mediumAverage);
});

function createPlanningMatch(
  activeController: ControllerType,
  options?: {
    seed?: number;
    activeTankIndex?: number;
    aiDifficulty?: "easy" | "medium" | "hard";
  }
) {
  const aiDifficulty = options?.aiDifficulty ?? "medium";
  const firstTankDifficulty = activeController === "ai" ? aiDifficulty : "medium";
  const secondTankDifficulty = activeController === "ai" ? "medium" : aiDifficulty;

  const config: MatchConfig = {
    roundLimit: 1,
    teamMode: false,
    weatherPreset: "breezy",
    seed: options?.seed ?? 24680,
    tanks: [
      {
        id: "alpha",
        displayName: "Alpha",
        color: "#f97316",
        controller: activeController,
        aiDifficulty: firstTankDifficulty,
        teamId: "solo-1",
        profileId: null,
        ...createFreshPersistentState()
      },
      {
        id: "bravo",
        displayName: "Bravo",
        color: "#3b82f6",
        controller: activeController === "ai" ? "human" : "ai",
        aiDifficulty: secondTankDifficulty,
        teamId: "solo-2",
        profileId: null,
        ...createFreshPersistentState()
      }
    ]
  };
  const session = createSession(config);
  const match = startNextRound(session);

  match.wind.force = 0;
  match.activeTankIndex = options?.activeTankIndex ?? 0;

  return match;
}

function prepareAirStrikeOnly(
  match: ReturnType<typeof createPlanningMatch>,
  tankIndex: number
): void {
  const tank = match.tanks[tankIndex];

  tank.weaponInventory.basicShell = 0;
  tank.weaponInventory.heavyShell = 0;
  tank.weaponInventory.multiShot = 0;
  tank.weaponInventory.airStrike = 4;
  tank.selectedWeaponId = "airStrike";
}

function averageAiAirStrikeAccuracy(aiDifficulty: "easy" | "medium" | "hard"): number {
  const accuracies: number[] = [];

  for (let seed = 120; seed < 160; seed += 1) {
    const match = createPlanningMatch("human", {
      seed,
      activeTankIndex: 1,
      aiDifficulty
    });
    prepareAirStrikeOnly(match, 1);

    const fireCommand = planAiTurn(match).find((command) => command.type === "fire");

    if (fireCommand?.type === "fire" && typeof fireCommand.airStrikeAccuracy === "number") {
      accuracies.push(fireCommand.airStrikeAccuracy);
    }
  }

  assert.ok(accuracies.length > 0);

  return accuracies.reduce((total, value) => total + value, 0) / accuracies.length;
}

function getPlannedAngle(initialAngle: number, commands: ReturnType<typeof planAiTurn>): number {
  return commands.reduce((angle, command) => {
    if (command.type === "adjustAngle") {
      return angle + command.delta;
    }

    return angle;
  }, initialAngle);
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
