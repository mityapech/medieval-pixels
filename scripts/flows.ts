// Daily flows for one seed: food made vs needed, crops, who works where, where the coins are.
// Usage: npx vite-node scripts/flows.ts [seed] [days] [every]
import { isFood } from '../sim/agent';
import { livingMembers } from '../sim/family';
import { createWorld, loadData, tick } from '../sim/index';
import { TRADES } from '../sim/types';

const [seed = 6, days = 40, every = 2] = process.argv.slice(2).map(Number);
const data = loadData();
const w = createWorld(data, seed);
for (let d = 0; d < days; d++) {
  const before = w.nextBatchId;
  const r = tick(w, data);
  if (r.day % every) continue;
  const made: Record<string, number> = {};
  for (const [id, b] of w.batches) if (id >= before && b.maker >= 0) made[b.good] = (made[b.good] ?? 0) + b.qty;
  const meals = Object.entries(made).filter(([g]) => isFood(data, g) && data.goods.get(g)!.kind === 'food').reduce((s, [, q]) => s + q, 0);
  const crops = ['wheat', 'vegetables', 'fruit'].map((g) => made[g] ?? 0).join('/');
  const jobs = TRADES.map((t) => t.slice(0, 2) + w.citizens.filter((c) => c.alive && c.trade === t).length).join(' ');
  const coinsBy = TRADES.map((t) => t.slice(0, 2) + w.citizens.filter((c) => c.alive && c.trade === t).reduce((s, c) => s + c.coins, 0)).join(' ');
  const purses = w.households.map((h) => livingMembers(w, h)).filter((m) => m.length).map((m) => m.reduce((s, c) => s + c.coins, 0));
  const brokeHomes = purses.filter((p) => p < 10).length;
  const vol = (g: string) => r.volume[g] ?? 0;
  console.log(`${r.day} alive ${r.alive} | baked ${meals} crops ${crops} wood ${made.wood ?? 0} | sold food ${['bread', 'pie', 'tart', 'vegetables', 'fruit'].map(vol).join('/')} @ ${['bread', 'vegetables'].map((g) => r.prices[g]?.toFixed(1) ?? '-').join('/')} | unmet ${JSON.stringify(w.unmet)} | jobs ${jobs} | coins ${coinsBy} | homes<10: ${brokeHomes}/${purses.length} | town ${r.townCoins} trs ${r.treasury} ch ${r.church} imp ${r.imports} exp ${r.exports}`);
}
