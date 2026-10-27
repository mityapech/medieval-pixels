// Town view movement: people reach where they are going along the streets, and nobody shakes on the spot.
import { describe, expect, it } from 'vitest';
import { centre, layoutTown, spotIn } from '../render/game/layout';
import { Life, type Mover, type Target } from '../render/game/life';
import { createWorld, loadData, tick } from '../sim/index';

const data = loadData();

function run(seed: number, hour: number) {
  const world = createWorld(data, seed);
  tick(world, data);
  const places = layoutTown(world);
  const life = new Life(world, data, places);
  life.newDay();
  const target = (m: Mover): Target => life.activity(m.c, hour / 24)
    ?? { dest: `home:${m.c.householdId}`, ...spotIn(places.get(`home:${m.c.householdId}`)!, m.c.id), mode: 'still' };
  const people: Mover[] = world.citizens.filter((c) => c.alive).map((c) => ({ c, ...centre(places.get(`home:${c.householdId}`)!) }));
  let now = 0;
  const frame = () => { now += 16.7; life.move(people.map((m) => ({ m, to: target(m) })), now, 16.7, 1); };
  for (let k = 0; k < 60 * 120; k++) frame(); // two minutes of walking
  const track = people.map(() => [] as [number, number][]);
  for (let k = 0; k < 120; k++) { frame(); people.forEach((m, i) => track[i]!.push([m.x, m.y])); }
  const shaking = people.filter((_, i) => {
    let reversals = 0;
    let prev: [number, number] | undefined;
    for (let k = 1; k < track[i]!.length; k++) {
      const dx = track[i]![k]![0] - track[i]![k - 1]![0];
      const dy = track[i]![k]![1] - track[i]![k - 1]![1];
      if (Math.hypot(dx, dy) < 0.05) { prev = undefined; continue; }
      if (prev && dx * prev[0] + dy * prev[1] < -0.01) reversals++;
      prev = [dx, dy];
    }
    return reversals > 20;
  });
  const arrived = people.filter((m) => m.settledAt === target(m).dest).length / people.length;
  return { shaking: shaking.length, arrived };
}

describe('movement', () => {
  it.each([[1, 10.5], [3, 9], [5, 15]])('seed %i at %ih: nobody shakes and nearly everyone arrives', (seed, hour) => {
    const r = run(seed, hour);
    expect(r.shaking).toBe(0);
    expect(r.arrived).toBeGreaterThan(0.9);
  });
});

describe('work progress', () => {
  it('reports progress through each step, and each finished batch exactly once at the end of its steps', () => {
    const world = createWorld(data, 1);
    tick(world, data);
    const life = new Life(world, data, layoutTown(world));
    life.newDay();
    const worker = world.citizens.find((c) => c.alive && c.workLog && c.workLog.filter((r) => r.qty > 0).length >= 2 && c.trade !== 'merchant')!;
    const made: string[] = [];
    let last: number | undefined;
    for (let t = 0.25; t <= 0.8; t += 0.0005) {
      const a = life.activity(worker, t);
      if (a) {
        expect(a.progress!).toBeGreaterThanOrEqual(0);
        expect(a.progress!).toBeLessThanOrEqual(1);
      }
      const now = a?.step ?? Number.POSITIVE_INFINITY;
      if (last !== undefined && now > last) made.push(...life.finishedBetween(worker, last, now).map((m) => `${m.qty} ${m.good}`));
      last = a?.step;
    }
    const expected = worker.workLog!.filter((r) => r.qty > 0).map((r) => `${r.qty} ${Object.keys(data.recipes.find((x) => x.id === r.recipe)!.outputs)[0]}`);
    expect(made).toEqual(expected);
  });
});
