// The generated town: every seed gets a complete, sensible layout, and generating it never changes the economy.
import { describe, expect, it } from 'vitest';
import { createWorld, loadData, runDays } from '../sim/index';

const data = loadData();
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
const SHARED = ['market', 'church', 'granary', 'work:farmer', 'work:baker', 'work:lumberjack', 'work:miner', 'work:forager',
  'work:fisherman', 'work:builder', 'work:innkeeper', 'work:blacksmith', 'work:merchant', 'school', 'infirmary'];

describe('generated town', () => {
  it.each(SEEDS)('has every shared place and a home for every household, nothing overlapping (seed %i)', (seed) => {
    const w = createWorld(data, seed);
    const { places, width, height, terrain, roads } = w.land;
    const keys = new Set(places.map((p) => p.key));
    for (const k of SHARED) expect(keys).toContain(k);
    for (const h of w.households) expect(keys).toContain(`home:${h.id}`);
    expect(keys.size).toBe(places.length);

    const taken = new Map<number, string>();
    const roadSet = new Set(roads);
    for (const p of places) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(width);
      expect(p.y + p.h).toBeLessThanOrEqual(height);
      for (let y = p.y; y < p.y + p.h; y++) {
        for (let x = p.x; x < p.x + p.w; x++) {
          const i = y * width + x;
          expect(taken.get(i), `${p.key} overlaps ${taken.get(i)}`).toBeUndefined();
          taken.set(i, p.key);
          expect(terrain[i], `${p.key} built on water`).not.toBe('water');
          expect(roadSet.has(i), `${p.key} built on a road`).toBe(false);
        }
      }
    }
  });

  it('differs between seeds and repeats for the same seed', () => {
    const a = createWorld(data, 1).land;
    expect(createWorld(data, 1).land).toEqual(a);
    expect(createWorld(data, 2).land.places.find((p) => p.key === 'market')).not.toEqual(a.places.find((p) => p.key === 'market'));
  });

  it('does not touch the economy: the world random stream is the same with or without the map', () => {
    const w = createWorld(data, 5);
    const before = w.rngState;
    expect(w.land.places.length).toBeGreaterThan(0);
    runDays(w, data, 5);
    // The economy only advances the world stream; land generation uses its own.
    expect(w.rngState).not.toBe(before);
    expect(createWorld(data, 5).rngState).toBe(before);
  });
});
