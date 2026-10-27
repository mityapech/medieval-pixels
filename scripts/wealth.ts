// How concentrated money is over time: share held by the richest 3 households, the treasury, and the poorest half.
import { livingMembers } from '../sim/family';
import { createWorld, loadData, tick } from '../sim/index';
const data = loadData();
const [seed = 6, days = 60] = process.argv.slice(2).map(Number);
const w = createWorld(data, seed);
for (let d = 1; d <= days; d++) {
  tick(w, data);
  if (d % 10) continue;
  const homes = w.households.map((h) => ({ h, m: livingMembers(w, h) })).filter((x) => x.m.length)
    .map(({ h, m }) => ({ name: h.family, size: m.length, purse: m.reduce((s, c) => s + c.coins, 0), jobs: m.map((c) => (c.trade ?? c.office ?? '-').slice(0, 3)).join(',') }))
    .sort((a, b) => b.purse - a.purse);
  const town = homes.reduce((s, x) => s + x.purse, 0) + w.treasury.coins + w.church.coins;
  const top3 = homes.slice(0, 3).reduce((s, x) => s + x.purse, 0);
  const bottom = homes.slice(Math.ceil(homes.length / 2)).reduce((s, x) => s + x.purse, 0);
  console.log(`day ${d}: town ${town} | top 3 homes ${Math.round(100 * top3 / town)}% | poorest half ${Math.round(100 * bottom / town)}% | treasury+church ${Math.round(100 * (w.treasury.coins + w.church.coins) / town)}%`);
  console.log('   ' + homes.map((x) => `${x.purse}/${x.size}[${x.jobs}]`).join(' '));
}
