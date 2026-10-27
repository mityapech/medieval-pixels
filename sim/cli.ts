// Runs the town from the terminal: npm run sim -- --days 100 --seed 1
import { createWorld, loadData, runDays, traceBatch, type DayReport, type World } from './index';
import { TRADES } from './types';

const args = process.argv.slice(2);
const arg = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const days = arg('days', 100);
const seed = arg('seed', 1);

const COLUMNS: [string, string][] = [
  ['wheat', 'wheat'], ['vegetables', 'veg'], ['fruit', 'fruit'], ['bread', 'bread'], ['pie', 'pie'], ['tart', 'tart'],
  ['wood', 'wood'], ['stone', 'stone'], ['iron_ore', 'ore'], ['iron_ingot', 'ingot'], ['nails', 'nails'],
  ['hoe', 'hoe'], ['axe', 'axe'], ['pickaxe', 'pick'],
];

const data = loadData();
const world = createWorld(data, seed);

console.log(`Medieval town: ${world.citizens.length} people in ${world.households.length} households, seed ${seed}.`);
console.log(`Coins in the world: ${world.initialCoins} (people, treasury, church, and ${world.neighbours.map((n) => n.name).join(', ')}).`);
console.log('Prices are the average paid that day ("-" = nothing traded). "town" = coins inside the town, "world" = every coin.\n');
const header = ['day', ...COLUMNS.map(([, h]) => h), 'town', 'world', 'alive', 'idle']
  .map((h, i) => (i === 0 ? h.padStart(4) : h.padStart(6))).join('');
console.log(header + '  starved');

runDays(world, data, days, (r: DayReport) => {
  const cells = COLUMNS.map(([g]) => (r.prices[g] === undefined ? '-' : r.prices[g]!.toFixed(1)).padStart(6));
  const starved = r.starved.map((s) => s.name).join(', ') || '';
  const nums = [r.townCoins, r.totalCoins, r.alive, r.unemployed].map((n) => String(n).padStart(6)).join('');
  console.log(`${String(r.day).padStart(4)}${cells.join('')}${nums}  ${starved}`);
  for (const e of r.eventsStarted) console.log(`       ! ${e}`);
  for (const j of r.jobChanges) {
    const what = !j.from ? `starts work as a ${j.to}` : !j.to ? `stops working as a ${j.from}` : `leaves ${j.from} to become a ${j.to}`;
    console.log(`       ${j.name} ${what} (${j.reason})`);
  }
  for (const e of r.familyEvents) console.log(`       ${e}`);
  if (r.day % 7 === 0) {
    const week = world.reports.slice(-7);
    const sum = (f: (x: DayReport) => number) => week.reduce((s, x) => s + f(x), 0);
    console.log(`       -- week ${r.day / 7}: treasury ${r.treasury}, church ${r.church}, ${r.guards} guards, ${r.priests} priests, ` +
      `alms ${sum((x) => x.alms)}, imports ${sum((x) => x.imports)}, exports ${sum((x) => x.exports)}, ` +
      `unemployed ${r.unemployed}/${r.workingAge} working-age${r.eventsActive.length ? `, ongoing: ${r.eventsActive.join(', ')}` : ''}`);
  }
});

summary(world);

function summary(world: World): void {
  const living = world.citizens.filter((c) => c.alive);
  const dead = world.citizens.filter((c) => !c.alive);
  console.log(`\nAfter ${world.day} days: ${living.length} alive, ${dead.length} starved.`);
  const last = world.reports.at(-1);
  console.log(`Coins: ${last?.totalCoins} in the world now, ${world.initialCoins} at the start; ${last?.townCoins} inside the town.`);
  console.log(`Authority: treasury ${last?.treasury}, church ${last?.church}, ${last?.guards} guards, ${last?.priests} priests. Unemployed: ${last?.unemployed} of ${last?.workingAge} working-age adults.`);
  const jobs = TRADES.map((t) => `${t} ${living.filter((c) => c.trade === t).length}`).join(', ');
  const events = world.reports.flatMap((r) => r.eventsStarted.map((e) => `day ${r.day}: ${e}`));
  if (events.length) console.log(`Events: ${events.join('; ')}`);
  const kids = living.filter((c) => c.age < data.town.workingAge.adult).length;
  const elders = living.filter((c) => c.age >= data.town.workingAge.elder).length;
  console.log(`Trades: ${jobs}; not working: ${kids} children, ${elders} elders, ${living.length - kids - elders - living.filter((c) => c.trade || c.office).length} adults at home.`);
  const homes = world.households.filter((h) => h.memberIds.some((id) => world.citizens[id]!.alive));
  console.log(`Households: ${homes.length} (${world.households.length} at the start). People without a fire today: ${living.filter((c) => c.needs.daysCold > 0).length}.`);
  const byWealth = [...living].sort((a, b) => b.coins - a.coins);
  const fmt = (c: (typeof living)[number]) => `${c.name} (${c.trade ?? c.office ?? 'at home'}, ${c.coins})`;
  if (byWealth.length) console.log(`Richest: ${byWealth.slice(0, 3).map(fmt).join('; ')}`);
  if (byWealth.length) console.log(`Poorest: ${byWealth.slice(-3).map(fmt).join('; ')}`);

  const loaf = [...world.batches.values()].reverse().find((b) => b.good === 'bread' && b.day > 0);
  if (loaf) {
    console.log(`\nWhere today's bread came from:`);
    for (const s of traceBatch(world, loaf.id)) {
      console.log(`${'  '.repeat(s.depth + 1)}${s.batch.qty} ${s.batch.good} made by ${s.makerName} on day ${s.batch.day} (batch #${s.batch.id})`);
    }
  }
}
