import assert from "node:assert/strict";
import test from "node:test";
import { createTerrain, carveCrater, generateSpawnXs, sampleTerrainHeight } from "./terrain";

test("createTerrain creates flattened landing zones near spawn positions", () => {
  const spawnXs = generateSpawnXs(3, 140, 42);
  const terrain = createTerrain(42, spawnXs);

  for (const spawnX of spawnXs) {
    const left = sampleTerrainHeight(terrain, spawnX - 1.5);
    const center = sampleTerrainHeight(terrain, spawnX);
    const right = sampleTerrainHeight(terrain, spawnX + 1.5);

    assert.ok(Math.abs(center - left) < 2.5);
    assert.ok(Math.abs(center - right) < 2.5);
  }
});

test("carveCrater lowers the terrain and increments revision", () => {
  const terrain = createTerrain(77, [25, 70]);
  const centerX = 70;
  const before = sampleTerrainHeight(terrain, centerX);
  const revisionBefore = terrain.revision;

  carveCrater(terrain, centerX, 5, 4);

  const after = sampleTerrainHeight(terrain, centerX);
  assert.ok(after < before);
  assert.equal(terrain.revision, revisionBefore + 1);
});
