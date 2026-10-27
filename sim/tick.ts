// One day: everyone eats if hungry, then works, then trades, then rests.
import { isFood, isWorkInput, shopsForSelf } from './agent';
import { authorityDay, reviewPosts, stockGranary } from './authority';
import { totalCoins, townCoins } from './coins';
import { converse } from './dialogue';
import { householdNeedMult, rollEvents } from './events';
import type { GameData } from './data';
import { afterDeath, headOf, inverseRelation, isHead, isWorkingAge, kinOf, livingMembers } from './family';
import { remember } from './memory';
import { stockOf, takeGoods } from './inventory';
import { findWork, reconsiderWork } from './jobs';
import { adjustPrices, newTally, tradePhase } from './market';
import { driftNeighbourPrices } from './neighbours';
import { work } from './production';
import { hireServants, payServants } from './service';
import type { Citizen, DayReport, World } from './types';
import { TRADES } from './types';

export function tick(world: World, data: GameData): DayReport {
  world.day++;
  for (const c of world.citizens) if (c.alive) c.coinHistory = [...c.coinHistory, c.coins].slice(-data.town.jobChange.everyDays);

  const eventsStarted = rollEvents(world, data);
  driftNeighbourPrices(world, data);
  const familyEvents: string[] = [];
  const starved = eatPhase(world, data, familyEvents);
  keepWarm(world, data);
  const jobChanges = findWork(world, data);
  const firstBatch = world.nextBatchId;
  for (const c of world.citizens) work(world, data, c);
  const produced: Record<string, number> = {};
  for (let id = firstBatch; id < world.nextBatchId; id++) {
    const b = world.batches.get(id)!;
    if (b.maker >= 0) produced[b.good] = (produced[b.good] ?? 0) + b.qty;
  }
  const tally = newTally();
  tradePhase(world, data, tally);
  stockGranary(world, data);
  const { tax: hearth, alms } = authorityDay(world, data);
  familyEvents.push(...payServants(world, data));
  world.taxHistory = [...world.taxHistory, tally.tax + hearth].slice(-28);
  for (const c of world.citizens) {
    if (!c.alive) continue;
    adjustPrices(world, data, c);
    c.needs.sleep = 1;
  }
  if (world.day % data.town.jobChange.everyDays === 0) jobChanges.push(...reconsiderWork(world, data));
  for (const j of jobChanges) {
    const c = world.citizens[j.id]!;
    if (!j.from && j.to) remember(world, c, 'started_work', { to: j.to });
    else if (j.from && j.to) remember(world, c, 'changed_job', { from: j.from, to: j.to });
  }
  if (world.day % data.town.authority.reviewEveryDays === 0) familyEvents.push(...reviewPosts(world, data), ...hireServants(world, data));

  const conversations = converse(world, data);
  world.conversations.push(...conversations);

  const living = world.citizens.filter((c) => c.alive);
  const adults = living.filter((c) => isWorkingAge(data, c));
  const report: DayReport = {
    day: world.day,
    prices: Object.fromEntries(Object.entries(tally.trades).map(([g, s]) => [g, s.coins / s.qty])),
    volume: Object.fromEntries(Object.entries(tally.trades).map(([g, s]) => [g, s.qty])),
    totalCoins: totalCoins(world),
    townCoins: townCoins(world),
    treasury: world.treasury.coins,
    church: world.church.coins,
    guards: living.filter((c) => c.office === 'guard').length,
    priests: living.filter((c) => c.office === 'priest').length,
    servants: living.filter((c) => c.office === 'servant').length,
    unemployed: adults.filter((c) => !c.trade && !c.office).length,
    workingAge: adults.length,
    alms,
    granary: world.granary.inventory.reduce((s, l) => s + l.qty, 0),
    imports: tally.imports,
    exports: tally.exports,
    eventsStarted,
    eventsActive: world.events.map((e) => e.name),
    alive: living.length,
    broke: living.filter((c) => c.coins === 0 && shopsForSelf(world, c)).length,
    comfortSpending: tally.comfort,
    starved: starved.map((c) => ({ id: c.id, name: c.name })),
    jobChanges,
    familyEvents,
    produced,
    conversations,
    ...townStatistics(world, data),
  };
  world.reports.push(report);
  return report;
}

/** Households, ages, wealth spread, occupations and today's money flows, for the stats page. */
function townStatistics(world: World, data: GameData): Pick<DayReport, 'households' | 'ages' | 'wealth' | 'jobs' | 'flows'> {
  const living = world.citizens.filter((c) => c.alive);
  const { adult, elder } = data.town.workingAge;
  const purses = world.households.map((h) => livingMembers(world, h)).filter((m) => m.length)
    .map((m) => m.reduce((s, c) => s + c.coins, 0)).sort((a, b) => a - b);
  const total = purses.reduce((s, p) => s + p, 0);
  const share = (part: number[]) => (total > 0 ? part.reduce((s, p) => s + p, 0) / total : 0);
  const jobs: Record<string, number> = {};
  for (const t of TRADES) jobs[t] = living.filter((c) => c.trade === t).length;
  for (const o of ['guard', 'priest', 'servant'] as const) jobs[o] = living.filter((c) => c.office === o).length;
  jobs.unemployed = living.filter((c) => isWorkingAge(data, c) && !c.trade && !c.office).length;
  const flows = { tax: 0, churchAlms: 0, charity: 0, kinSupport: 0, servantWages: 0, granary: 0 };
  for (let i = world.ledger.length - 1; i >= 0 && world.ledger[i]!.day === world.day; i--) {
    const { memo, amount, from } = world.ledger[i]!;
    if (memo === 'market tax' || memo === 'hearth tax') flows.tax += amount;
    else if (memo === 'alms') flows.churchAlms += amount;
    else if (memo.startsWith('alms from')) flows.charity += amount;
    else if (memo.startsWith('kin support')) flows.kinSupport += amount;
    else if (memo === 'servant wage') flows.servantWages += amount;
    else if (memo.startsWith('granary sells') || (memo.startsWith('granary buys') && from === 'treasury')) flows.granary += amount;
  }
  return {
    households: purses.length,
    ages: {
      children: living.filter((c) => c.age < adult).length,
      adults: living.filter((c) => c.age >= adult && c.age < elder).length,
      elders: living.filter((c) => c.age >= elder).length,
    },
    wealth: {
      median: purses.length ? purses[Math.floor(purses.length / 2)]! : 0,
      mean: purses.length ? total / purses.length : 0,
      top3Share: share(purses.slice(-3)),
      poorHalfShare: share(purses.slice(0, Math.floor(purses.length / 2))),
    },
    jobs,
    flows,
  };
}

export function runDays(world: World, data: GameData, days: number, onDay?: (r: DayReport) => void): void {
  for (let i = 0; i < days; i++) {
    const r = tick(world, data);
    onDay?.(r);
  }
}

/**
 * Everyone eats from the household larder (the head's), then from their own stock. Families share: whoever has
 * gone hungry longest eats first, then children, then elders, then working adults.
 */
function eatPhase(world: World, data: GameData, events: string[]): Citizen[] {
  const starved: Citizen[] = [];
  const { adult, elder } = data.town.workingAge;
  const rank = (c: Citizen) => (c.age < adult ? 0 : c.age >= elder ? 1 : 2);
  const order = world.citizens.filter((c) => c.alive)
    .sort((a, b) => b.needs.daysHungry - a.needs.daysHungry || rank(a) - rank(b) || a.age - b.age);
  for (const c of order) {
    const head = headOf(world, c);
    const larders = head.alive && head !== c ? [head, c] : [c];
    // Eat household food first, the best-liked first; a trade's own inputs only as a last resort.
    const meal = larders.flatMap((l) => l.inventory.filter((lot) => isFood(data, lot.good)).map((lot) => ({ l, lot })))
      .sort((a, b) => Number(isWorkInput(data, a.l, a.lot.good)) - Number(isWorkInput(data, b.l, b.lot.good))
        || (data.goods.get(b.lot.good)!.appeal ?? 1) - (data.goods.get(a.lot.good)!.appeal ?? 1))[0];
    if (meal) {
      takeGoods(meal.l, meal.lot.good, 1);
      c.needs.daysHungry = 0;
    } else if (++c.needs.daysHungry >= data.town.daysUntilStarvation) {
      c.alive = false;
      c.diedOnDay = world.day;
      starved.push(c);
      for (const k of kinOf(world, c)) remember(world, k.person, 'lost_kin', { name: c.name.split(' ')[0]!, relation: inverseRelation(k.relation) });
      events.push(...afterDeath(world, data, c));
    }
  }
  return starved;
}

/** Each household burns its firewood. With none, everyone in it has a cold day (v0 only counts them). */
function keepWarm(world: World, data: GameData): void {
  for (const h of world.households) {
    const members = livingMembers(world, h);
    if (!members.length) continue;
    for (const need of data.town.householdNeeds) {
      let left = Math.round(need.perHouseholdPerDay * householdNeedMult(world, data, need.good));
      for (const m of [...members].sort((a, b) => Number(isHead(world, b)) - Number(isHead(world, a)))) {
        const n = Math.min(left, stockOf(m, need.good));
        if (n > 0) takeGoods(m, need.good, n);
        left -= n;
      }
      for (const m of members) m.needs.daysCold = left > 0 ? m.needs.daysCold + 1 : 0;
    }
  }
}
