// Working-age adults by role (trade, guard, priest, servant, idle) over 100 days for seeds 1-8.
import { createWorld, loadData, tick } from '../sim/index';
const data = loadData();
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const w = createWorld(data, seed);
  const row: string[] = [];
  for (let d = 1; d <= 100; d++) {
    tick(w, data);
    if (d === 1 || d % 25 === 0) {
      const adults = w.citizens.filter((c) => c.alive && c.age >= 12 && c.age < 60);
      const n = (f: (c: typeof adults[0]) => boolean) => adults.filter(f).length;
      row.push(`d${d}: trades ${n((c) => !!c.trade)} guard ${n((c) => c.office === 'guard')} priest ${n((c) => c.office === 'priest')} servant ${n((c) => c.office === 'servant')} idle ${n((c) => !c.trade && !c.office)}`);
    }
  }
  console.log(`seed ${seed} | ${row.join(' | ')}`);
}
