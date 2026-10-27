// The town grows and changes: everyone ages a year every yearDays days, couples have children, the old die,
// and young people marry. A new couple moves into the house of one of them if they live alone; otherwise they
// live apart with family until a house to rent is free (see sim/property.ts, where burghers build them).
import { cheapestMeal } from './agent';
import type { GameData } from './data';
import { afterDeath, householdOf, isAdult, kinOf, livingMembers, moveToHousehold } from './family';
import { remember } from './memory';
import { random, shuffle } from './rng';
import type { Citizen, Household, World } from './types';
import { newCitizen } from './world';

export interface GrowthNews {
  born: { id: number; name: string }[];
  diedOfAge: { id: number; name: string; age: number }[];
  married: string[];
  homes: string[];
}

const surname = (c: Citizen) => c.name.split(' ').slice(1).join(' ');
const struggling = (world: World, data: GameData, c: Citizen) => {
  const members = livingMembers(world, householdOf(world, c));
  return members.reduce((s, m) => s + m.coins, 0) < data.town.reserveDays * members.length * cheapestMeal(data, c);
};

export function growthDay(world: World, data: GameData, news: GrowthNews, familyEvents: string[]): void {
  const g = data.town.growth;
  const perDay = (perYear: number) => perYear / g.yearDays;

  // A new year: everyone is a year older.
  if (world.day % g.yearDays === 0) for (const c of world.citizens) if (c.alive) c.age++;

  // The old die, more likely the older they are.
  for (const c of world.citizens) {
    if (!c.alive || c.age < g.oldAgeFrom) continue;
    if (random(world) >= perDay((c.age - g.oldAgeFrom + 1) * g.oldAgeRiskPerYearOver)) continue;
    c.alive = false;
    c.diedOnDay = world.day;
    news.diedOfAge.push({ id: c.id, name: c.name, age: c.age });
    for (const k of kinOf(world, c)) remember(world, k.person, 'lost_kin', { name: c.name.split(' ')[0]!, relation: k.relation });
    familyEvents.push(...afterDeath(world, data, c));
  }

  // Couples have children, less often when the household is struggling.
  for (const a of world.citizens) {
    if (!a.alive || a.spouseId === null || a.id > a.spouseId) continue;
    const b = world.citizens[a.spouseId]!;
    if (!b.alive || a.householdId !== b.householdId) continue;
    const younger = Math.min(a.age, b.age);
    if (younger < g.fertileAges[0] || younger > g.fertileAges[1]) continue;
    const chance = perDay(g.birthsPerCouplePerYear) * (struggling(world, data, a) ? 0.3 : 1);
    if (random(world) >= chance) continue;
    const h = householdOf(world, a);
    const baby = newCitizen(world, data, h, 0, [a, b], h.family);
    news.born.push({ id: baby.id, name: baby.name });
    remember(world, a, 'new_baby', { name: baby.name.split(' ')[0]! });
    remember(world, b, 'new_baby', { name: baby.name.split(' ')[0]! });
  }

  // Young people marry someone from another household who is not close kin.
  const single = shuffle(world, world.citizens.filter((c) => c.alive && isAdult(data, c) && c.age >= g.marryAges[0] && c.age <= g.marryAges[1]
    && (c.spouseId === null || !world.citizens[c.spouseId]!.alive) && !world.waiting.some((n) => n.a === c.id || n.b === c.id)));
  const taken = new Set<number>();
  for (const a of single) {
    if (taken.has(a.id) || random(world) >= perDay(g.marriagesPerSinglePerYear)) continue;
    const kin = new Set(kinOf(world, a).map((k) => k.person.id));
    const b = single.find((x) => x !== a && !taken.has(x.id) && x.householdId !== a.householdId && !kin.has(x.id) && Math.abs(x.age - a.age) <= 8);
    if (!b) continue;
    taken.add(a.id).add(b.id);
    a.spouseId = b.id;
    b.spouseId = a.id;
    remember(world, a, 'married', { name: b.name.split(' ')[0]! });
    remember(world, b, 'married', { name: a.name.split(' ')[0]! });
    news.married.push(`${a.name} married ${b.name}`);
    // Whoever lives alone takes the other in; otherwise they need a house of their own.
    const alone = [a, b].find((c) => livingMembers(world, householdOf(world, c)).length === 1);
    if (alone) {
      const other = alone === a ? b : a;
      moveIn(world, data, other, householdOf(world, alone), familyEvents);
      continue;
    }
    // Otherwise they need a house to rent: they live apart with family until one is free.
    world.waiting.push({ a: a.id, b: b.id });
    familyEvents.push(`${a.name} and ${b.name} are looking for a house to rent`);
  }
}

function moveIn(world: World, data: GameData, c: Citizen, to: Household, events: string[]): void {
  const from = householdOf(world, c);
  const wasHead = from.headId === c.id;
  moveToHousehold(world, c, to);
  events.push(`${c.name} moved in with the ${to.family} household`);
  if (wasHead) {
    // The household they leave passes to its eldest remaining adult.
    const rest = livingMembers(world, from).sort((x, y) => y.age - x.age);
    if (rest[0]) from.headId = rest[0].id;
  }
  void data;
}
