// Construction: buildings wear down day by day, and their owners pay builders to repair them. Homes are paid for
// by the household, the town's own buildings by the treasury. A builder buys the materials (wood, stone, nails)
// at market, does the work, and is paid the materials plus a day's labour. A household that cannot afford repairs
// lets its home run down; work sites out in the country do not decay.
import { cheapestMeal, foodReserveCoins, talent } from './agent';
import { transfer } from './coins';
import type { GameData } from './data';
import { livingMembers } from './family';
import { buyBest, type DayTally } from './market';
import { remember } from './memory';
import { takeGoods } from './inventory';
import { buildProjects } from './property';
import type { Citizen, World } from './types';

/** Work sites in the country, which do not wear down. */
const OPEN_AIR = new Set(['work:farmer', 'work:lumberjack', 'work:miner', 'work:forager', 'work:fisherman']);

/** Starting condition for every building: a stable value from the seed, so it never touches the economy's random stream. */
export function initialBuildings(world: World): World['buildings'] {
  const out: World['buildings'] = {};
  world.land.places.forEach((p, i) => {
    if (OPEN_AIR.has(p.key)) return;
    const h = Math.imul((world.seed + 1) * 2654435761 + i * 40503, 2246822519) >>> 0;
    out[p.key] = { condition: 55 + (h % 46) };
  });
  return out;
}

function quote(world: World, data: GameData, builder: Citizen): number {
  const { construction } = data.town;
  let materials = 0;
  for (const [g, q] of Object.entries(construction.materials)) materials += q * (builder.seen[g]?.avg ?? data.goods.get(g)!.basePrice);
  return Math.ceil(materials + construction.labourMeals * cheapestMeal(data, builder));
}

/** Daily: buildings wear down; those below the repair line get a builder if their owner can pay. Returns news. */
export function constructionDay(world: World, data: GameData, tally: DayTally): string[] {
  const { construction } = data.town;
  const news: string[] = [];
  for (const [key, b] of Object.entries(world.buildings)) {
    b.condition = Math.max(0, b.condition - (key.startsWith('home:') ? construction.decayPerDay.home : construction.decayPerDay.public));
  }
  const builders = world.citizens.filter((c) => c.alive && c.trade === 'builder');
  for (const c of builders) c.today.job = undefined;
  const jobs = Object.entries(world.buildings).filter(([, b]) => b.condition < construction.repairBelow).sort((a, b) => a[1].condition - b[1].condition);
  for (const [key, b] of jobs) {
    // The most able free builder takes the worst job.
    const builder = builders.filter((c) => !c.today.job).sort((x, y) => talent(data, y, 'builder') - talent(data, x, 'builder'))[0];
    if (!builder) break;
    const label = world.land.places.find((p) => p.key === key)?.label ?? key;
    // Who pays: the household for its home (if it can spare it), the treasury for the town's buildings.
    const price = quote(world, data, builder);
    let payer: Citizen | typeof world.treasury | undefined;
    if (key.startsWith('home:')) {
      const members = livingMembers(world, world.households[Number(key.slice(5))]!);
      const richest = [...members].sort((x, y) => y.coins - x.coins)[0];
      if (richest && richest.coins - price >= foodReserveCoins(world, data, richest)) payer = richest;
    } else if (world.treasury.coins >= price * 2) {
      payer = world.treasury;
    }
    if (!payer) continue;
    // The builder buys what materials they lack; with any missing, the job waits.
    const before = builder.coins;
    let missing = false;
    for (const [g, q] of Object.entries(construction.materials)) {
      const have = builder.inventory.filter((l) => l.good === g).reduce((s, l) => s + l.qty, 0);
      if (have < q) buyBest(world, data, builder, [g], q - have, foodReserveCoins(world, data, builder), tally);
      if (builder.inventory.filter((l) => l.good === g).reduce((s, l) => s + l.qty, 0) < q) missing = true;
    }
    if (missing) continue;
    for (const [g, q] of Object.entries(construction.materials)) takeGoods(builder, g, q);
    const spent = before - builder.coins;
    const bill = Math.min(payer.coins, Math.max(price, spent + Math.ceil(construction.labourMeals * cheapestMeal(data, builder))));
    transfer(world, payer, builder, bill, `repairs to the ${label}`);
    b.condition = Math.min(100, b.condition + Math.round(construction.repairAmount * talent(data, builder, 'builder')));
    builder.today.job = key;
    remember(world, builder, 'built', { place: label });
    news.push(`${builder.name} repaired the ${label}`);
  }
  buildProjects(world, data, tally, builders, news);
  return news;
}
