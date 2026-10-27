// The town authority: market tax in, guards' and priests' wages out, a grant to the church, and the church's alms.
import { cheapestMeal } from './agent';
import { transfer } from './coins';
import { remember } from './memory';
import type { GameData } from './data';
import { householdOf, isWorkingAge, livingMembers } from './family';
import { sellableQty } from './agent';
import { averageCost, moveGoods, stockOf } from './inventory';
import { askPrice } from './market';
import type { Citizen, GoodId, Office, World } from './types';

export function marketTax(world: World, data: GameData, seller: Citizen, amount: number): number {
  const tax = Math.min(seller.coins, Math.floor(amount * data.town.authority.marketTax));
  if (tax > 0) transfer(world, seller, world.treasury, tax, 'market tax');
  return tax;
}

function officers(world: World, office: Office): Citizen[] {
  return world.citizens.filter((c) => c.alive && c.office === office);
}

/**
 * Hearth tax: each well-off household pays a small share of its savings above hearthTaxAboveDays of food,
 * from whoever holds its coins. The poor pay nothing. Returns coins taken.
 */
function hearthTax(world: World, data: GameData): number {
  const a = data.town.authority;
  let taken = 0;
  for (const h of world.households) {
    const members = livingMembers(world, h);
    if (!members.length) continue;
    const purse = members.reduce((s, m) => s + m.coins, 0);
    const daily = members.length * cheapestMeal(data, world.citizens[h.headId]!);
    const above = purse - a.hearthTaxAboveDays * daily;
    if (above <= 0) continue;
    const payer = [...members].sort((x, y) => y.coins - x.coins)[0]!;
    const tax = Math.min(Math.floor(above * a.hearthTaxShare), payer.coins);
    if (tax <= 0) continue;
    transfer(world, payer, world.treasury, tax, 'hearth tax');
    taken += tax;
  }
  return taken;
}

/**
 * Daily: collect the hearth tax, pay wages (as far as the money goes), give the church its grant,
 * and let the church hand out alms. Returns tax collected and alms given.
 */
export function authorityDay(world: World, data: GameData): { tax: number; alms: number } {
  const a = data.town.authority;
  const tax = hearthTax(world, data);
  for (const [office, wage] of [['guard', a.guardWage], ['priest', a.priestWage]] as const) {
    for (const c of officers(world, office)) transfer(world, world.treasury, c, Math.min(wage, world.treasury.coins), `${office} wage`);
  }
  const wagesPerDay = officers(world, 'guard').length * a.guardWage + officers(world, 'priest').length * a.priestWage;
  // The treasury keeps a few weeks of wages and passes the rest on to the church a little at a time.
  const surplus = world.treasury.coins - a.treasuryKeepDays * Math.max(wagesPerDay, a.guardWage);
  if (surplus > 0) transfer(world, world.treasury, world.church, Math.floor(surplus * a.churchGrantShare), 'church grant');
  return { tax, alms: giveAlms(world, data) };
}

/** The church helps households where someone is going hungry or the purse cannot buy a day's food. */
function giveAlms(world: World, data: GameData): number {
  const needy = world.households
    .map((h) => ({ h, members: livingMembers(world, h) }))
    .filter(({ members }) => members.length)
    .map(({ h, members }) => {
      const head = world.citizens[h.headId]!;
      const dayOfFood = Math.ceil(members.length * cheapestMeal(data, head));
      const purse = members.reduce((s, m) => s + m.coins, 0);
      const hungry = members.some((m) => m.needs.daysHungry > 0);
      return { head, dayOfFood, purse, hungry };
    })
    .filter((x) => x.head.alive && (x.hungry || x.purse < x.dayOfFood))
    .sort((a, b) => Number(b.hungry) - Number(a.hungry) || a.purse - b.purse);
  let given = 0;
  for (const x of needy) {
    const amount = Math.min(world.church.coins, x.dayOfFood * 2 - x.purse);
    if (amount <= 0) continue;
    transfer(world, world.church, x.head, amount, 'alms');
    remember(world, x.head, 'received_alms', { giver: 'the church' });
    given += amount;
  }
  return given;
}

/** Weekly: decide how many posts the treasury can afford from recent tax, then hire from the unemployed or let people go. */
export function reviewPosts(world: World, data: GameData): string[] {
  const a = data.town.authority;
  const recent = world.taxHistory.slice(-a.reviewEveryDays);
  const taxPerDay = recent.length ? recent.reduce((s, x) => s + x, 0) / recent.length : 0;
  const savingsBonus = Math.max(0, world.treasury.coins - 60 * a.guardWage) / 60;
  const budget = taxPerDay * a.wageBudgetShare + savingsBonus;
  const avgWage = a.guardWage * a.guardShare + a.priestWage * (1 - a.guardShare);
  const posts = Math.floor(budget / avgWage);
  const priests = posts > 0 ? Math.max(1, posts - Math.round(posts * a.guardShare)) : 0;
  const want: Record<'guard' | 'priest', number> = { guard: posts - priests, priest: priests };

  const events: string[] = [];
  // Unemployed adults from the poorest households first, then workers whose trade lost them money this week.
  const purse = (c: Citizen) => livingMembers(world, householdOf(world, c)).reduce((s, m) => s + m.coins, 0);
  const weekNet = (c: Citizen) => c.coins - (c.coinHistory[0] ?? c.coins);
  const idle = world.citizens.filter((c) => c.alive && !c.trade && !c.office && isWorkingAge(data, c)).sort((x, y) => purse(x) - purse(y));
  const losing = world.citizens.filter((c) => c.alive && c.trade && weekNet(c) < 0).sort((x, y) => weekNet(x) - weekNet(y));
  const candidates = [...idle, ...losing];
  for (const office of ['guard', 'priest'] as const) {
    const current = officers(world, office);
    for (const c of current.slice(want[office])) {
      c.office = null;
      events.push(`${c.name} is let go as a ${office} (treasury cannot pay)`);
    }
    // Hiring is gradual: a few new posts per review, so the town is not emptied of a trade overnight.
    for (let i = current.length; i < Math.min(want[office], current.length + a.maxHiresPerReview) && candidates.length; i++) {
      const c = candidates.shift()!;
      const was = c.trade;
      c.trade = null;
      c.office = office;
      c.employerHousehold = null;
      remember(world, c, 'took_post', { office });
      events.push(`${c.name} is taken on as a ${office}${was ? ` (was a ${was})` : ''}`);
    }
  }
  return events;
}

/**
 * After the market: in times of plenty the authority buys cheap grain and vegetables for the public granary,
 * up to its target, from what producers could not sell. Never while the town is short of them.
 */
export function stockGranary(world: World, data: GameData): void {
  const g = data.town.granary;
  const a = data.town.authority;
  const wagesPerDay = officers(world, 'guard').length * a.guardWage + officers(world, 'priest').length * a.priestWage;
  let budget = Math.floor((world.treasury.coins - a.treasuryKeepDays * Math.max(wagesPerDay, a.guardWage)) * g.budgetShare);
  if (budget <= 0 || (world.unmet.food ?? 0) > 0) return;
  for (const good of g.goods) {
    if ((world.unmet[good] ?? 0) > 0) continue;
    let room = g.targetUnits - stockOf(world.granary, good);
    const ceiling = data.goods.get(good)!.basePrice * g.buyBelow;
    const sellers = world.citizens
      .filter((c) => c.alive && c.prices[good] !== undefined && sellableQty(world, data, c, good) > 0 && askPrice(c, good) <= ceiling)
      .sort((x, y) => askPrice(x, good) - askPrice(y, good));
    for (const seller of sellers) {
      if (room <= 0 || budget <= 0) break;
      const price = askPrice(seller, good);
      const n = Math.min(room, sellableQty(world, data, seller, good), Math.floor(budget / price));
      if (n <= 0) break;
      transfer(world, world.treasury, seller, n * price, `granary buys ${n} ${good}`);
      moveGoods(seller, world.granary, good, n, price);
      seller.today.sold[good] = (seller.today.sold[good] ?? 0) + n;
      room -= n;
      budget -= n * price;
    }
  }
}

/** What the granary charges in a shortage: what it paid, rounded up. */
export function granaryPrice(world: World, good: GoodId): number | undefined {
  const cost = averageCost(world.granary, good);
  return cost === undefined ? undefined : Math.max(1, Math.ceil(cost));
}

/** Sells from the granary at cost; the coins go back to the treasury. */
export function sellFromGranary(world: World, buyer: Citizen, good: GoodId, n: number, price: number): void {
  transfer(world, buyer, world.treasury, n * price, `granary sells ${n} ${good}`);
  moveGoods(world.granary, buyer, good, n, price);
}
