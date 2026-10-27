// One day: everyone eats if hungry, then works, then trades, then rests.
import { isFood, isWorkInput, shopsForSelf } from './agent';
import { authorityDay, reviewPosts } from './authority';
import { totalCoins, townCoins } from './coins';
import { householdNeedMult, rollEvents } from './events';
import type { GameData } from './data';
import { afterDeath, headOf, isHead, isWorkingAge, livingMembers } from './family';
import { stockOf, takeGoods } from './inventory';
import { findWork, reconsiderWork } from './jobs';
import { adjustPrices, newTally, tradePhase } from './market';
import { driftNeighbourPrices } from './neighbours';
import { work } from './production';
import type { Citizen, DayReport, World } from './types';

export function tick(world: World, data: GameData): DayReport {
  world.day++;
  for (const c of world.citizens) if (c.alive) c.coinHistory = [...c.coinHistory, c.coins].slice(-data.town.jobChange.everyDays);

  const eventsStarted = rollEvents(world, data);
  driftNeighbourPrices(world, data);
  const familyEvents: string[] = [];
  const starved = eatPhase(world, data, familyEvents);
  keepWarm(world, data);
  const jobChanges = findWork(world, data);
  for (const c of world.citizens) work(world, data, c);
  const tally = newTally();
  tradePhase(world, data, tally);
  const { tax: hearth, alms } = authorityDay(world, data);
  world.taxHistory = [...world.taxHistory, tally.tax + hearth].slice(-28);
  for (const c of world.citizens) {
    if (!c.alive) continue;
    adjustPrices(world, data, c);
    c.needs.sleep = 1;
  }
  if (world.day % data.town.jobChange.everyDays === 0) jobChanges.push(...reconsiderWork(world, data));
  if (world.day % data.town.authority.reviewEveryDays === 0) familyEvents.push(...reviewPosts(world, data));

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
    unemployed: adults.filter((c) => !c.trade && !c.office).length,
    workingAge: adults.length,
    alms,
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
  };
  world.reports.push(report);
  return report;
}

export function runDays(world: World, data: GameData, days: number, onDay?: (r: DayReport) => void): void {
  for (let i = 0; i < days; i++) {
    const r = tick(world, data);
    onDay?.(r);
  }
}

/** Everyone eats from the household larder (the head's), then from their own stock. Children eat first, then elders. */
function eatPhase(world: World, data: GameData, events: string[]): Citizen[] {
  const starved: Citizen[] = [];
  const living = world.citizens.filter((c) => c.alive).sort((a, b) => a.age - b.age);
  const order = [...living.filter((c) => c.age < data.town.workingAge.adult), ...living.filter((c) => c.age >= data.town.workingAge.elder), ...living.filter((c) => c.age >= data.town.workingAge.adult && c.age < data.town.workingAge.elder)];
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
