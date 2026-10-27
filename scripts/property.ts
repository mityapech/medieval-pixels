// What happens to property over a run: who owns it, rents and sales, what burghers build, who is hired.
// Usage: npx vite-node scripts/property.ts [firstSeed] [lastSeed] [days]
import { createWorld, loadData, tick } from '../sim/index';
const [first = 1, last = 4, days = 100] = process.argv.slice(2).map(Number);
const data = loadData();
for (let seed = first; seed <= last; seed++) {
  const w = createWorld(data, seed);
  let sales = 0, rent = 0, starved = 0, built = 0, opened: string[] = [], hired = 0;
  for (let d = 1; d <= days; d++) {
    const r = tick(w, data);
    sales += r.propertySales.length; rent += r.rentPaid; starved += r.starved.length;
    for (const e of r.familyEvents) { if (e.includes('ready to let')) built++; if (e.includes(' opened ')) opened.push(e.split(' opened ')[1]!.split(',')[0]!); if (e.includes('took work for wages')) hired++; }
  }
  const owners = new Map<number, number>();
  for (const p of Object.values(w.property)) if (p.owner !== null) owners.set(p.owner, (owners.get(p.owner) ?? 0) + 1);
  const alive = w.citizens.filter((c) => c.alive).length;
  const big = [...owners.entries()].filter(([, n]) => n > 1).length;
  console.log(`seed ${seed}: ${alive} people | owners of 2+ properties: ${big} (${(100 * big / alive).toFixed(1)}%) | sales ${sales} | rent+fees ${rent} | houses built ${built} | waiting couples ${w.waiting.length} | employees ${w.citizens.filter((c) => c.alive && c.employer !== undefined).length} (hired ${hired}) | starved ${starved}`);
  if (opened.length) console.log(`   opened: ${opened.join('; ')}`);
  console.log(`   businesses: ${Object.values(w.property).filter((p) => p.kind === 'business').map((p) => `${p.name}${p.niche ? ` (${p.niche})` : ''}`).slice(0, 8).join('; ')}`);
}
