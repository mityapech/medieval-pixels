// How people choose work. No rescues: each person compares what trades earn with what they can afford to start.
import { cheapestMeal, seenPrice, trait } from './agent';
import type { GameData } from './data';
import { headOf, householdOf, isHead, isWorkingAge, kinOf, livingMembers, takeUpTrade } from './family';
import { stockOf } from './inventory';
import { random, shuffle } from './rng';
import type { Citizen, DayReport, Trade, World } from './types';
import { TRADES } from './types';

type JobChange = DayReport['jobChanges'][number];

/** Coins this person needs to start a trade: tools that cannot be done without, a day of inputs, and any stock money. */
export function entryCost(data: GameData, c: Citizen, trade: Trade): number {
  let cost = data.town.trades[trade].startCapital ?? 0;
  const recipes = data.recipesByTrade[trade];
  for (const r of recipes) {
    if (r.tool && !r.handFactor && !stockOf(c, r.tool)) cost += seenPrice(data, c, r.tool);
  }
  const first = recipes.find((r) => Object.keys(r.inputs).length);
  if (first) {
    for (const [g, q] of Object.entries(first.inputs)) cost += Math.max(0, q - stockOf(c, g)) * seenPrice(data, c, g);
  }
  return Math.ceil(cost);
}

/**
 * What this person believes each trade earns: the average weekly gain of a few practitioners they know
 * (kin first, then whoever they happen to meet). People judge from different samples, so they do not all
 * rush into the same trade at once. A trade they know nobody in looks like an untested opening (0).
 */
function knownEarnings(world: World, data: GameData, c: Citizen): Record<Trade, number> {
  const kin = new Set(kinOf(world, c).map((k) => k.person));
  const known = {} as Record<Trade, number>;
  for (const t of TRADES) {
    const workers = world.citizens.filter((w) => w.alive && w !== c && w.trade === t && w.coinHistory.length);
    const sample = [...workers.filter((w) => kin.has(w)), ...shuffle(world, workers.filter((w) => !kin.has(w)))]
      .slice(0, data.town.jobChange.acquaintances);
    known[t] = sample.length ? sample.reduce((s, w) => s + net(w), 0) / sample.length : 0;
  }
  return known;
}

function net(c: Citizen): number {
  return c.coins - (c.coinHistory[0] ?? c.coins);
}

/** The best-earning trade this person can afford to start, other than the one they have. */
function bestAffordable(world: World, data: GameData, c: Citizen, typical: Record<Trade, number>): Trade | undefined {
  const reserve = data.town.reserveDays * cheapestMeal(data, c);
  return TRADES.filter((t) => t !== c.trade && entryCost(data, c, t) + (entryCost(data, c, t) > 0 ? reserve : 0) <= c.coins)
    .sort((a, b) => typical[b] - typical[a])[0];
}

/** A household is struggling when it cannot cover a few days of food from the head's purse, or someone is hungry or cold. */
export function householdStruggling(world: World, data: GameData, c: Citizen): boolean {
  const h = householdOf(world, c);
  const members = livingMembers(world, h);
  const head = headOf(world, c);
  const daily = members.length * cheapestMeal(data, head) + seenPrice(data, head, 'wood');
  const purse = members.reduce((s, m) => s + m.coins, 0);
  return purse < daily * data.town.reserveDays || members.some((m) => m.needs.daysHungry > 0 || m.needs.daysCold > 0);
}

/**
 * Daily: unemployed adults in struggling households look for work. Others now and then take up a trade
 * that is clearly paying well (a famine makes farming tempting), so some stay at home and some do not.
 */
export function findWork(world: World, data: GameData): JobChange[] {
  const { jobChange } = data.town;
  const changes: JobChange[] = [];
  for (const c of world.citizens) {
    if (!c.alive || c.trade || c.office || !isWorkingAge(data, c)) continue;
    const typical = knownEarnings(world, data, c);
    const struggling = householdStruggling(world, data, c);
    const to = bestAffordable(world, data, c, typical);
    if (!to) continue;
    const tempting = typical[to] >= 4 * jobChange.minGain && random(world) < jobChange.chance / jobChange.everyDays;
    if (!struggling && !tempting) continue;
    takeUpTrade(data, c, to);
    changes.push({ id: c.id, name: c.name, from: null, to, reason: struggling ? 'household short of money' : `${to}s are doing well` });
  }
  return changes;
}

/**
 * Weekly: workers losing money move to the best trade they can afford, and anyone may move to a trade
 * that clearly pays better. A second earner in a comfortable household may stop working at a loss.
 */
export function reconsiderWork(world: World, data: GameData): JobChange[] {
  const { jobChange } = data.town;
  const changes: JobChange[] = [];
  for (const c of world.citizens) {
    if (!c.alive || !c.coinHistory.length) continue;
    if (random(world) >= jobChange.chance * trait(data, c, 'jobChangeMult')) continue;
    const typical = knownEarnings(world, data, c);
    // Servants and other post-holders go back to a trade when one clearly pays better than their wage.
    if (c.office) {
      const to = bestAffordable(world, data, c, typical);
      const mine = net(c);
      if (!to || typical[to] < 2 * Math.max(mine, jobChange.minGain) || typical[to] - mine < 4 * jobChange.minGain) continue;
      const was = c.office;
      c.office = null;
      c.employerHousehold = null;
      takeUpTrade(data, c, to);
      changes.push({ id: c.id, name: c.name, from: null, to, reason: `leaves post as ${was}: ${to}s earn more (week: ${mine} vs ${typical[to]})` });
      continue;
    }
    if (!c.trade) continue;
    const from = c.trade;
    const mine = net(c);

    const head = headOf(world, c);
    const comfortable = head.coins >= jobChange.quitWhenSavedDays * cheapestMeal(data, head) * livingMembers(world, householdOf(world, c)).length;
    if (mine < 0 && !isHead(world, c) && comfortable) {
      takeUpTrade(data, c, null);
      changes.push({ id: c.id, name: c.name, from, to: null, reason: 'household can afford it' });
      continue;
    }
    const to = bestAffordable(world, data, c, typical);
    if (!to) continue;
    // Moving up needs a big, clear gap; people do not abandon a living trade for a small edge.
    const gain = typical[to] - Math.max(typical[from], mine);
    const losing = mine < 0;
    if (gain < jobChange.minGain) continue;
    if (!losing && (typical[to] < 2 * Math.max(mine, typical[from], jobChange.minGain) || gain < 4 * jobChange.minGain)) continue;
    takeUpTrade(data, c, to);
    const reason = losing
      ? entryCost(data, c, to) === 0 ? 'losing money; takes work with no start-up cost' : 'losing money; another trade pays better'
      : `doing well enough to move up (week: ${mine} vs ${typical[to]} typical)`;
    changes.push({ id: c.id, name: c.name, from, to, reason });
  }
  return changes;
}
