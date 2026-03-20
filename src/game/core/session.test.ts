import assert from "node:assert/strict";
import test from "node:test";
import { buildMatchConfig, createDefaultSetupState } from "./session";

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
