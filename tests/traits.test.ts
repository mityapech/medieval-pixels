import { describe, expect, it } from 'vitest';
import { createWorld, loadData, tick } from '../sim/index';
import { talent } from '../sim/agent';
import { genteel, householdStruggling, rankOf } from '../sim/jobs';

const data = loadData();
const WORK = [...data.traits.values()].filter((t) => t.kind === 'work').map((t) => t.id);

describe('traits and work', () => {
  it('there are six work traits, and everyone has exactly one', () => {
    expect(WORK).toHaveLength(6);
    const world = createWorld(data, 3);
    for (const c of world.citizens) expect(c.traits.filter((t) => WORK.includes(t))).toHaveLength(1);
  });

  it('every trade has someone with a gift for it, and the founding puts gifted people in their trades', () => {
    for (const t of Object.keys(data.town.trades)) expect(WORK.some((w) => (data.traits.get(w)!.talent?.[t as never] ?? 1) > 1), t).toBe(true);
    let gifted = 0;
    let workers = 0;
    for (const seed of [1, 2, 3]) {
      const world = createWorld(data, seed);
      for (const c of world.citizens.filter((x) => x.trade)) { workers++; if (talent(data, c, c.trade) > 1) gifted++; }
    }
    // By chance alone about a third would be; sorting by gift makes it most.
    expect(gifted / workers).toBeGreaterThan(0.6);
  });

  it('a gift strongly raises what someone makes', () => {
    const world = createWorld(data, 1);
    const tough = world.citizens.find((c) => c.traits.includes('tough'))!;
    expect(talent(data, tough, 'miner')).toBeGreaterThanOrEqual(1.5);
    expect(talent(data, tough, 'baker')).toBe(1);
  });

  it('well-off families do not go down into labour, and labourers change work less often', () => {
    const changes = { labour: 0, other: 0 };
    const workerDays = { labour: 0, other: 0 };
    for (const seed of [1, 2]) {
      const world = createWorld(data, seed);
      for (let d = 0; d < 150; d++) {
        const proud = new Set(world.citizens.filter((c) => c.alive && genteel(world, data, c) && !householdStruggling(world, data, c)).map((c) => c.id));
        const before = new Map(world.citizens.map((c) => [c.id, c.trade]));
        for (const c of world.citizens) if (c.alive && c.trade) workerDays[rankOf(data, c.trade) === 0 ? 'labour' : 'other']++;
        const r = tick(world, data);
        for (const j of r.jobChanges) {
          const from = before.get(j.id);
          if (from && j.to) changes[rankOf(data, from) === 0 ? 'labour' : 'other']++;
          if (from && j.to && proud.has(j.id)) expect(rankOf(data, j.to), `${j.name}: ${from} to ${j.to}`).toBeGreaterThanOrEqual(rankOf(data, from));
        }
      }
    }
    expect(changes.labour / workerDays.labour).toBeLessThan(changes.other / workerDays.other + 1e-9);
  });
});
