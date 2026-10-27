// The town authority: market tax in, guards' and priests' wages out, a grant to the church, and the church's alms.
import { cheapestMeal } from './agent';
import { transfer } from './coins';
import type { GameData } from './data';
import { householdOf, isWorkingAge, livingMembers } from './family';
import type { Citizen, Office, World } from './types';

export function marketTax(world: World, data: GameData, seller: Citizen, amount: number): number {
  const tax = Math.min(seller.coins, Math.floor(amount * data.town.authority.marketTax));
  if (tax > 0) transfer(world, seller, world.treasury, tax, 'market tax');
  return tax;
}

function officers(world: World, office: Office): Citizen[] {
  return world.citizens.filter((c) => c.alive && c.office === office);
}

/** Hearth tax: each well-off household pays a little each day, from whoever holds its coins. The poor are exempt. Returns coins taken. */
function hearthTax(world: World, data: GameData): number {
  const a = data.town.authority;
  let taken = 0;
  for (const h of world.households) {
    const members = livingMembers(world, h);
    if (!members.length) continue;
    const purse = members.reduce((s, m) => s + m.coins, 0);
    const daily = members.length * cheapestMeal(data, world.citizens[h.headId]!);
    if (purse < a.hearthTaxAboveDays * daily) continue;
    const payer = [...members].sort((x, y) => y.coins - x.coins)[0]!;
    const tax = Math.min(a.hearthTax, payer.coins);
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
  const surplus = world.treasury.coins - 21 * wagesPerDay;
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
  const want: Record<Office, number> = { guard: posts - priests, priest: priests };

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
      events.push(`${c.name} is taken on as a ${office}${was ? ` (was a ${was})` : ''}`);
    }
  }
  return events;
}
