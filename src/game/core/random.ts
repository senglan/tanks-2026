export function normalizeSeed(seed: number): number {
  return (seed >>> 0) || 1;
}

export function createSeededRandom(seed: number): () => number {
  let value = normalizeSeed(seed);

  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return normalizeSeed(value) / 0xffffffff;
  };
}

export function randomBetween(
  random: () => number,
  min: number,
  max: number
): number {
  return min + (max - min) * random();
}

export function randomInt(
  random: () => number,
  min: number,
  max: number
): number {
  return Math.floor(randomBetween(random, min, max + 1));
}
