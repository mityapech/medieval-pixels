// Is the economy healthy, or merely alive? Averages over seeds: unemployment, posts, charity, money, prices, trades.
import { livingMembers } from '../sim/family';
import { createWorld, loadData, runDays } from '../sim/index';
import { TRADES } from '../sim/types';
const data = loadData();
const [first = 1, last = 40, days = 100] = process.argv.slice(2).map(Number);
const rows: Record<string, number[]> = {};
const add = (k: string, v: number) => (rows[k] ??= []).push(v);
for (let seed = first; seed <= last; seed++) {
  const w = createWorld(data, seed);
  const medianPurse = () => {
    const p = w.households.map((h) => livingMembers(w, h)).filter((m) => m.length).map((m) => m.reduce((s, c) => s + c.coins, 0)).sort((a, b) => a - b);
    return p[Math.floor(p.length / 2)] ?? 0;
  };
  const startTown = w.citizens.reduce((s, c) => s + c.coins, 0) + w.treasury.coins + w.church.coins;
  const startMedian = medianPurse();
  runDays(w, data, days);
  const r = w.reports.at(-1)!;
  const sum = (memo: string) => w.ledger.filter((e) => e.memo.startsWith(memo)).reduce((s, e) => s + e.amount, 0) / days;
  add('dead', w.citizens.filter((c) => !c.alive).length);
  add('unemployed %', (100 * r.unemployed) / r.workingAge);
  add('guards', r.guards); add('priests', r.priests); add('servants', r.servants);
  for (const t of TRADES) add(t, w.citizens.filter((c) => c.alive && c.trade === t).length);
  add('town coins end/start %', (100 * r.townCoins) / startTown);
  add('median household purse start', startMedian); add('median household purse end', medianPurse());
  add('alms/day (church)', sum('alms') - sum('alms from')); add('alms/day (people)', sum('alms from')); add('kin support/day', sum('kin support'));
  add('servant wages/day', sum('servant wage')); add('market sales/day', w.reports.reduce((s, x) => s + Object.entries(x.prices).reduce((a, [g, p]) => a + p * (x.volume[g] ?? 0), 0), 0) / days);
  add('imports/day', w.reports.reduce((s, x) => s + x.imports, 0) / days); add('exports/day', w.reports.reduce((s, x) => s + x.exports, 0) / days);
  add('hungry people today', w.citizens.filter((c) => c.alive && c.needs.daysHungry > 0).length);
  add('bread price last week', w.reports.slice(-7).map((x) => x.prices.bread).filter((x) => x !== undefined).reduce((s, x, _, a) => s + x! / a.length, 0));
  add('wheat price last week', w.reports.slice(-7).map((x) => x.prices.wheat).filter((x) => x !== undefined).reduce((s, x, _, a) => s + x! / a.length, 0));
}
for (const [k, v] of Object.entries(rows)) {
  const s = [...v].sort((a, b) => a - b);
  console.log(`${k.padEnd(30)} mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).padStart(7)}   min ${s[0]!.toFixed(1).padStart(7)}   max ${s.at(-1)!.toFixed(1).padStart(7)}`);
}
