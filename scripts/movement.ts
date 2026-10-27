// Runs the town view's movement without a browser and reports anyone shaking (reversing direction frame after
// frame). Usage: npx vite-node scripts/movement.ts [seed] [hour]
import { createWorld, loadData, tick } from '../sim/index';
import { centre, layoutTown, spotIn } from '../render/game/layout';
import { Life, type Mover, type Target } from '../render/game/life';

const [seed = 1, hour = 10.5] = process.argv.slice(2).map(Number);
const data = loadData();
const world = createWorld(data, seed);
tick(world, data);
const places = layoutTown(world);
const life = new Life(world, data, places);
life.newDay();
const t = hour / 24;
const target = (m: Mover): Target => life.activity(m.c, t) ?? { dest: `home:${m.c.householdId}`, ...spotIn(places.get(`home:${m.c.householdId}`)!, m.c.id), mode: 'still' };
const people: Mover[] = world.citizens.filter((c) => c.alive).map((c) => ({ c, ...centre(places.get(`home:${c.householdId}`)!) }));

let now = 0;
const frame = () => { now += 16.7; life.move(people.map((m) => ({ m, to: target(m) })), now, 16.7, 1); };
for (let k = 0; k < 60 * 120; k++) frame(); // two minutes to get where they are going
const track = people.map(() => [] as [number, number][]);
for (let k = 0; k < 120; k++) { frame(); people.forEach((m, i) => track[i]!.push([m.x, m.y])); }
const shaking = people.map((m, i) => {
  let reversals = 0;
  let prev: [number, number] | undefined;
  for (let k = 1; k < track[i]!.length; k++) {
    const dx = track[i]![k]![0] - track[i]![k - 1]![0];
    const dy = track[i]![k]![1] - track[i]![k - 1]![1];
    if (Math.hypot(dx, dy) < 0.05) { prev = undefined; continue; }
    if (prev && dx * prev[0] + dy * prev[1] < -0.01) reversals++;
    prev = [dx, dy];
  }
  return { m, reversals };
}).filter((s) => s.reversals > 20);
for (const s of shaking) console.log(`${s.m.c.name} (age ${s.m.c.age}) ${target(s.m).task ?? 'at home'} -> ${target(s.m).dest}: ${s.reversals} reversals`);
console.log(`seed ${seed} at ${hour}h: ${shaking.length} of ${people.length} shaking`);
if (process.env.TRACE) {
  const m = people.find((p) => p.c.name === process.env.TRACE)!;
  for (let k = 0; k < 6; k++) {
    frame();
    const to = target(m);
    console.log(k, m.x.toFixed(2), m.y.toFixed(2), 'settled', m.settledAt, 'spot', to.x.toFixed(1), to.y.toFixed(1), 'cost', life.pathCost(to.dest, m.x, m.y));
  }
}
