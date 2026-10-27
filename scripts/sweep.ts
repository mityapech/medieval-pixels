// Scores settings by deaths across many seeds. Overrides are JSON merged into data/town.json, e.g.
//   npx vite-node scripts/sweep.ts 1 20 '{"jobChange":{"chance":0.1}}' '{"jobChange":{"chance":0.3}}'
import { createWorld, loadData, runDays } from '../sim/index';

const [first, last, ...variants] = process.argv.slice(2);
type Obj = Record<string, unknown>;
const merge = (a: Obj, b: Obj): Obj => {
  const out: Obj = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge((a[k] ?? {}) as Obj, v as Obj) : v;
  return out;
};
for (const v of variants.length ? variants : ['{}']) {
  const data = loadData();
  data.town = merge(data.town as unknown as Obj, JSON.parse(v)) as unknown as typeof data.town;
  const deaths: number[] = [];
  for (let seed = Number(first); seed <= Number(last); seed++) {
    const w = createWorld(data, seed);
    runDays(w, data, Number(process.env.DAYS ?? 100));
    deaths.push(w.reports.reduce((s, r) => s + r.starved.length, 0));
  }
  const total = deaths.reduce((s, d) => s + d, 0);
  console.log(`${v.padEnd(60)} total ${String(total).padStart(4)} | zero-death seeds ${deaths.filter((d) => d === 0).length}/${deaths.length} | worst ${Math.max(...deaths)} | ${deaths.join(' ')}`);
}
