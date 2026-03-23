import type { AiDifficulty } from "./types";

export const AIRSTRIKE_TIMING_SWEET_CENTER = 0.5;
export const AIRSTRIKE_TIMING_SWEET_WIDTH = 0.2;
export const AIRSTRIKE_TIMING_SWEEP_SPEED = 1.55;

const AIRSTRIKE_MAX_TARGET_OFFSET = 11;
const AIRSTRIKE_MIN_ACCURACY = 0.22;

export type AirStrikeFeedback = "Perfect" | "Good" | "Off";

export interface AirStrikeTimingResult {
  adjustedTargetX: number;
  offset: number;
  accuracy: number;
  spreadScale: number;
  feedback: AirStrikeFeedback;
  normalizedError: number;
}

export interface PingPongMeterState {
  meterValue: number;
  meterDirection: -1 | 1;
}

export function resolveAirStrikeTiming(
  targetX: number,
  meterValue: number,
  arenaWidth: number
): AirStrikeTimingResult {
  const clampedValue = clamp(meterValue, 0, 1);
  const delta = clampedValue - AIRSTRIKE_TIMING_SWEET_CENTER;
  const normalizedError = Math.min(1, Math.abs(delta) / 0.5);
  const easedError = Math.pow(normalizedError, 1.1);
  const direction = delta === 0 ? 0 : Math.sign(delta);
  const offset = direction * easedError * AIRSTRIKE_MAX_TARGET_OFFSET;
  const adjustedTargetX = clamp(targetX + offset, 0, arenaWidth);
  const accuracy = clamp(1 - normalizedError * 0.82, AIRSTRIKE_MIN_ACCURACY, 1);

  return {
    adjustedTargetX,
    offset,
    accuracy,
    spreadScale: 1 + (1 - accuracy) * 0.45,
    feedback: getAirStrikeFeedbackFromError(normalizedError),
    normalizedError
  };
}

export function getAiAirStrikeTimingValue(
  difficulty: AiDifficulty,
  random: () => number
): number {
  const amplitude = {
    easy: 0.38,
    medium: 0.25,
    hard: 0.13
  }[difficulty];

  return clamp(AIRSTRIKE_TIMING_SWEET_CENTER + (random() * 2 - 1) * amplitude, 0, 1);
}

export function advancePingPongMeter(
  meterValue: number,
  meterDirection: -1 | 1,
  deltaSeconds: number,
  speed = AIRSTRIKE_TIMING_SWEEP_SPEED
): PingPongMeterState {
  let value = meterValue + meterDirection * deltaSeconds * speed;
  let direction = meterDirection;

  while (value > 1 || value < 0) {
    if (value > 1) {
      value = 2 - value;
      direction = -1;
      continue;
    }

    value = -value;
    direction = 1;
  }

  return {
    meterValue: clamp(value, 0, 1),
    meterDirection: direction
  };
}

export function chooseAirStrikeRunDirection(
  seed: number,
  turnNumber: number,
  ownerTankId: string,
  targetX: number
): -1 | 1 {
  const hashedOwner = hashId(ownerTankId);
  const quantizedTarget = Math.round(targetX * 10) >>> 0;
  const mix = (
    normalize(seed) ^
    normalize(turnNumber * 2654435761) ^
    normalize(hashedOwner * 40503) ^
    normalize(quantizedTarget * 1315423911)
  ) >>> 0;

  return (mix & 1) === 0 ? -1 : 1;
}

export function getAirStrikeFeedbackFromAccuracy(accuracy: number): AirStrikeFeedback {
  if (accuracy >= 0.88) {
    return "Perfect";
  }

  if (accuracy >= 0.66) {
    return "Good";
  }

  return "Off";
}

function getAirStrikeFeedbackFromError(normalizedError: number): AirStrikeFeedback {
  if (normalizedError <= AIRSTRIKE_TIMING_SWEET_WIDTH / 2) {
    return "Perfect";
  }

  if (normalizedError <= 0.34) {
    return "Good";
  }

  return "Off";
}

function hashId(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function normalize(value: number): number {
  return value >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
