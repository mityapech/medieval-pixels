// Seeded random numbers (mulberry32) so every run is reproducible.
import type { World } from './types';

export function random(world: World): number {
  let t = (world.rngState = (world.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(world: World, maxExclusive: number): number {
  return Math.floor(random(world) * maxExclusive);
}

export function pick<T>(world: World, items: readonly T[]): T {
  const item = items[randomInt(world, items.length)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}

export function shuffle<T>(world: World, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(world, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Rounds 2.3 to 2 (70%) or 3 (30%), so fractional output is fair on average. */
export function roundRandom(world: World, x: number): number {
  const floor = Math.floor(x);
  return floor + (random(world) < x - floor ? 1 : 0);
}
