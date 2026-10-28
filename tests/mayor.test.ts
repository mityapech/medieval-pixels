import { describe, expect, it } from 'vitest';
import { createWorld, loadData, tick, totalCoins, upgradeTown } from '../sim/index';
import { dayPlan } from '../sim/routine';

const data = loadData();

describe('the mayor', () => {
  it('works at the Town Hall: holds the post, leaves their trade, and only the sitting mayor holds it', () => {
    for (const seed of [1, 2]) {
      const world = createWorld(data, seed);
      expect(world.land.places.some((p) => p.key === 'townhall'), 'a Town Hall on the map').toBe(true);
      expect(world.property.townhall?.owner).toBeNull();
      const start = totalCoins(world);
      for (let d = 0; d < 140; d++) {
        tick(world, data);
        const holders = world.citizens.filter((c) => c.alive && c.office === 'mayor');
        expect(holders.length).toBeLessThanOrEqual(1);
        if (world.mayor && world.citizens[world.mayor.id]!.alive) {
          const m = world.citizens[world.mayor.id]!;
          expect(m.office).toBe('mayor');
          expect(m.trade).toBeNull();
          if (!m.sick) expect(dayPlan(world, data, m).some((t) => t.where === 'townhall')).toBe(true);
        }
      }
      expect(world.elections.length).toBeGreaterThanOrEqual(2);
      expect(totalCoins(world)).toBe(start);
    }
  });

  it('an older town without a Town Hall gets one when it loads', () => {
    const world = createWorld(data, 4);
    world.land.places = world.land.places.filter((p) => p.key !== 'townhall');
    delete world.property.townhall;
    tick(world, data);
    upgradeTown(world, data);
    expect(world.land.places.filter((p) => p.key === 'townhall')).toHaveLength(1);
    expect(world.citizens[world.mayor!.id]!.office).toBe('mayor');
    tick(world, data);
  });
});
