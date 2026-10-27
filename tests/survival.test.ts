// DESIGN.md test 1: the town survives 100 in-game days without starvation.
// Checked on 40 seeds here; scripts/sweep.ts checks hundreds (`npx vite-node scripts/sweep.ts 1 600`).
import { describe, expect, it } from 'vitest';
import { createWorld, loadData, runDays } from '../sim/index';

const data = loadData();

describe('the town survives 100 days', () => {
  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('nobody starves (seed %i)', (seed) => {
    const world = createWorld(data, seed);
    runDays(world, data, 100);
    const starved = world.reports.flatMap((r) => r.starved.map((s) => `day ${r.day}: ${s.name}`));
    expect(starved).toEqual([]);
  });
});
