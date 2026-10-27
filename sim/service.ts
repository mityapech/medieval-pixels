// Domestic service: well-off households hire servants from poorer ones and pay them a daily wage.
// The first form of hiring; it turns savings that would sit idle into a living for others.
import { cheapestMeal } from './agent';
import { transfer } from './coins';
import { remember } from './memory';
import type { GameData } from './data';
import { isWorkingAge, livingMembers } from './family';
import type { Citizen, Household, World } from './types';

/** A servant's daily wage: enough for a few meals at what food costs now. */
export function servantWage(data: GameData, payer: Citizen): number {
  return Math.ceil(data.town.service.wageMeals * cheapestMeal(data, payer));
}

function purseOf(world: World, h: Household): number {
  return livingMembers(world, h).reduce((s, m) => s + m.coins, 0);
}

function richest(world: World, h: Household): Citizen | undefined {
  return [...livingMembers(world, h)].sort((a, b) => b.coins - a.coins)[0];
}

/** What a household keeps before it will spend on service: comfort.thresholdDays of its food and firewood. */
function comfortLevel(world: World, data: GameData, h: Household): number {
  const head = world.citizens[h.headId]!;
  const members = livingMembers(world, h);
  return data.town.comfort.thresholdDays * (members.length * cheapestMeal(data, head) + 4);
}

/** Daily: employers pay their servants. A household that can no longer pay lets the servant go. Returns notices. */
export function payServants(world: World, data: GameData): string[] {
  const events: string[] = [];
  for (const s of world.citizens) {
    if (!s.alive || s.office !== 'servant' || s.employerHousehold === null) continue;
    const employer = world.households[s.employerHousehold]!;
    const payer = richest(world, employer);
    const wage = payer ? servantWage(data, payer) : 0;
    if (!payer || payer.coins < wage) {
      s.office = null;
      s.employerHousehold = null;
      events.push(`${s.name} is let go from service with the ${employer.family} household`);
      remember(world, s, 'let_go', { family: employer.family });
      continue;
    }
    transfer(world, payer, s, wage, 'servant wage');
  }
  return events;
}

/** Weekly: households with savings well above comfort take on a servant (two for a large home), from idle adults in the poorest homes. */
export function hireServants(world: World, data: GameData): string[] {
  const { service } = data.town;
  const events: string[] = [];
  const homes = world.households.filter((h) => livingMembers(world, h).length).sort((a, b) => purseOf(world, b) - purseOf(world, a));
  for (const h of homes) {
    const payer = richest(world, h);
    if (!payer) continue;
    const spare = purseOf(world, h) - comfortLevel(world, data, h);
    // A household needs only so much help: a servant for a well-off home, a second only for a large one.
    const needed = livingMembers(world, h).length >= service.membersForSecond ? 2 : 1;
    const affordable = Math.min(needed, Math.floor(spare / (servantWage(data, payer) * service.affordDays)));
    const current = world.citizens.filter((c) => c.alive && c.office === 'servant' && c.employerHousehold === h.id).length;
    if (affordable <= current) continue;
    const homePurse = (c: Citizen) => purseOf(world, world.households[c.householdId]!);
    const candidates = world.citizens
      // Service draws on idle adults only; it does not pull people out of productive trades.
      .filter((c) => c.alive && c.householdId !== h.id && !c.office && !c.trade && isWorkingAge(data, c))
      .sort((a, b) => homePurse(a) - homePurse(b));
    const c = candidates[0];
    if (!c) continue;
    const was = c.trade;
    c.trade = null;
    c.office = 'servant';
    c.employerHousehold = h.id;
    events.push(`${c.name} goes into service with the ${h.family} household${was ? ` (was a ${was})` : ''}`);
    remember(world, c, 'entered_service', { family: h.family });
  }
  return events;
}
