import {
  DEFAULT_ARENA_HEIGHT,
  DEFAULT_ARENA_WIDTH,
  DEFAULT_TERRAIN_SAMPLES,
  MAX_CLIMB_SLOPE,
  MAX_TILT_DEGREES,
  TANK_BODY_HEIGHT,
  TANK_HALF_WIDTH
} from "../content/definitions";
import { createSeededRandom, randomBetween } from "./random";
import type { TerrainState } from "./types";

export interface SurfaceInfo {
  x: number;
  y: number;
  tiltDeg: number;
  slope: number;
}

export function createTerrain(
  seed: number,
  spawnXs: number[],
  width = DEFAULT_ARENA_WIDTH,
  height = DEFAULT_ARENA_HEIGHT,
  sampleCount = DEFAULT_TERRAIN_SAMPLES
): TerrainState {
  const random = createSeededRandom(seed);
  const sampleSpacing = width / (sampleCount - 1);
  const floor = 3;
  const phaseA = randomBetween(random, 0, Math.PI * 2);
  const phaseB = randomBetween(random, 0, Math.PI * 2);
  const phaseC = randomBetween(random, 0, Math.PI * 2);
  const samples: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    const terrainHeight =
      18 +
      Math.sin(t * 6.4 + phaseA) * 4.8 +
      Math.sin(t * 12.2 + phaseB) * 2.6 +
      Math.sin(t * 22.4 + phaseC) * 1.2 +
      randomBetween(random, -1.2, 1.2);

    samples.push(clamp(terrainHeight, floor + 6, height - 13));
  }

  smoothSamples(samples, 4);

  const terrain: TerrainState = {
    width,
    height,
    floor,
    sampleSpacing,
    samples,
    revision: 0
  };

  for (const spawnX of spawnXs) {
    flattenLandingZone(terrain, spawnX, 3.5);
  }

  smoothSamples(terrain.samples, 2);
  terrain.revision += 1;

  return terrain;
}

export function cloneTerrain(terrain: TerrainState): TerrainState {
  return {
    ...terrain,
    samples: [...terrain.samples]
  };
}

export function generateSpawnXs(
  count: number,
  width: number,
  seed: number
): number[] {
  const random = createSeededRandom(seed ^ 0xa21c7d1f);
  const margin = 12;
  const span = width - margin * 2;
  const positions: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const base = margin + (span * (index + 0.5)) / count;
    const jitter = randomBetween(random, -4, 4);
    positions.push(clamp(base + jitter, margin, width - margin));
  }

  return positions.sort((left, right) => left - right);
}

export function sampleTerrainHeight(terrain: TerrainState, x: number): number {
  const clampedX = clamp(x, 0, terrain.width);
  const sampleIndex = clampedX / terrain.sampleSpacing;
  const leftIndex = Math.floor(sampleIndex);
  const rightIndex = Math.min(terrain.samples.length - 1, leftIndex + 1);
  const alpha = sampleIndex - leftIndex;
  const leftValue = terrain.samples[leftIndex] ?? terrain.floor;
  const rightValue = terrain.samples[rightIndex] ?? leftValue;

  return leftValue + (rightValue - leftValue) * alpha;
}

export function sampleTerrainSlope(terrain: TerrainState, x: number): number {
  const left = sampleTerrainHeight(terrain, x - 1);
  const right = sampleTerrainHeight(terrain, x + 1);

  return (right - left) / 2;
}

export function resolveSurfaceInfo(
  terrain: TerrainState,
  x: number
): SurfaceInfo {
  const clampedX = clamp(x, TANK_HALF_WIDTH, terrain.width - TANK_HALF_WIDTH);
  const leftHeight = sampleTerrainHeight(terrain, clampedX - TANK_HALF_WIDTH);
  const rightHeight = sampleTerrainHeight(terrain, clampedX + TANK_HALF_WIDTH);
  const centerHeight = sampleTerrainHeight(terrain, clampedX);
  const slope = (rightHeight - leftHeight) / (TANK_HALF_WIDTH * 2);
  const tiltDeg = clamp(
    (Math.atan(slope) * 180) / Math.PI,
    -MAX_TILT_DEGREES,
    MAX_TILT_DEGREES
  );

  return {
    x: clampedX,
    y: centerHeight + TANK_BODY_HEIGHT / 2,
    tiltDeg,
    slope
  };
}

export function canMoveTo(terrain: TerrainState, fromX: number, toX: number): boolean {
  const currentHeight = sampleTerrainHeight(terrain, fromX);
  const nextHeight = sampleTerrainHeight(terrain, toX);
  const slope = Math.abs(nextHeight - currentHeight) / Math.max(0.01, Math.abs(toX - fromX));

  return slope <= MAX_CLIMB_SLOPE;
}

export function carveCrater(
  terrain: TerrainState,
  centerX: number,
  radius: number,
  depth: number
): void {
  const startIndex = Math.max(0, Math.floor((centerX - radius) / terrain.sampleSpacing));
  const endIndex = Math.min(
    terrain.samples.length - 1,
    Math.ceil((centerX + radius) / terrain.sampleSpacing)
  );

  for (let index = startIndex; index <= endIndex; index += 1) {
    const sampleX = index * terrain.sampleSpacing;
    const distance = Math.abs(sampleX - centerX);

    if (distance > radius) {
      continue;
    }

    const ratio = distance / radius;
    const carveAmount = (1 - ratio * ratio) * depth;
    terrain.samples[index] = Math.max(terrain.floor, terrain.samples[index] - carveAmount);
  }

  smoothSpan(terrain.samples, startIndex, endIndex);
  terrain.revision += 1;
}

export function normalizeTankX(terrain: TerrainState, x: number): number {
  return clamp(x, TANK_HALF_WIDTH + 0.5, terrain.width - TANK_HALF_WIDTH - 0.5);
}

function flattenLandingZone(terrain: TerrainState, centerX: number, radius: number): void {
  const startIndex = Math.max(0, Math.floor((centerX - radius) / terrain.sampleSpacing));
  const endIndex = Math.min(
    terrain.samples.length - 1,
    Math.ceil((centerX + radius) / terrain.sampleSpacing)
  );
  let total = 0;
  let count = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    total += terrain.samples[index];
    count += 1;
  }

  const level = total / Math.max(1, count);

  for (let index = startIndex; index <= endIndex; index += 1) {
    const sampleX = index * terrain.sampleSpacing;
    const distance = Math.abs(sampleX - centerX);
    const ratio = distance / Math.max(0.001, radius);
    const blend = Math.max(0, 1 - ratio);
    terrain.samples[index] = terrain.samples[index] * (1 - blend) + level * blend;
  }
}

function smoothSamples(samples: number[], passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    smoothSpan(samples, 0, samples.length - 1);
  }
}

function smoothSpan(samples: number[], startIndex: number, endIndex: number): void {
  const copy = [...samples];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const previous = copy[Math.max(0, index - 1)];
    const current = copy[index];
    const next = copy[Math.min(copy.length - 1, index + 1)];
    samples[index] = previous * 0.25 + current * 0.5 + next * 0.25;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
