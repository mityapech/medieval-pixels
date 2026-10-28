// Elections, mayors and the town's fortune over a long run; and how each doctrine fares when forced for the whole run.
// Usage: npx vite-node scripts/politics.ts [firstSeed] [lastSeed] [days]
import { createWorld, loadData, tick } from '../sim/index';
import type { Doctrine } from '../sim/types';
const [first = 1, last = 6, days = 200] = process.argv.slice(2).map(Number);
const data = loadData();
for (let seed = first; seed <= last; seed++) {
  const w = createWorld(data, seed);
  const path: string[] = [];
  let starved = 0, upgrades = 0;
  for (let d = 1; d <= days; d++) {
    const r = tick(w, data);
    starved += r.starved.length;
    upgrades += r.familyEvents.filter((e) => e.includes('hired builders to enlarge')).length;
    if (r.election) path.push(`d${d}: ${r.mayor!.doctrine}`);
    if (d === 1 || d % 50 === 0) path.push(`[${r.fortune.score} ${r.fortune.level}]`);
  }
  console.log(`seed ${seed}: ${path.join(' ')} | starved ${starved} | home improvements ${upgrades} | alive ${w.citizens.filter((c) => c.alive).length}`);
}
console.log('--- each doctrine for the whole run (seeds 1-10) ---');
for (const doctrine of ['liberal', 'traditionalist', 'isolationist', 'freemarket'] as Doctrine[]) {
  let starved = 0, fortune = 0, alive = 0, treasury = 0, posts = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const w = createWorld(data, seed);
    w.mayor = { id: 0, doctrine, since: 0, termEnds: 1e9 };
    let r;
    for (let d = 1; d <= days; d++) { r = tick(w, data); starved += r.starved.length; }
    fortune += r!.fortune.score; alive += r!.alive; treasury += r!.treasury; posts += r!.guards + r!.priests + w.citizens.filter((c) => c.alive && (c.office === 'teacher' || c.office === 'healer')).length;
  }
  console.log(`${doctrine.padEnd(15)} starved ${starved} | fortune ${(fortune / 10).toFixed(0)} | alive ${(alive / 10).toFixed(0)} | treasury ${(treasury / 10).toFixed(0)} | public posts ${(posts / 10).toFixed(1)}`);
}
