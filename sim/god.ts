// The player's powers over the town, in the spirit of a god game: rename people and families, give or take coins,
// marry or part couples, move people between households, and choose who heads a household. Coins still only move by
// transfer: what the player gives comes from the heavens' purse, and what they take goes back to it, so the world's
// total never changes. Each power returns a line for the town news, or throws an Error the player can read.
import { transfer } from './coins';
import type { GameData } from './data';
import { householdOf, isAdult, kinOf, livingMembers } from './family';
import { remember } from './memory';
import { moveOut } from './property';
import type { Citizen, Household, World } from './types';

/** Coins the heavens hold when a town is founded. */
export const HEAVENS_PURSE = 50_000;

function alive(c: Citizen): void {
  if (!c.alive) throw new Error(`${c.name} is dead.`);
}

export function renameCitizen(world: World, c: Citizen, name: string): string {
  const next = name.trim().replace(/\s+/g, ' ');
  if (!next || next.length > 40) throw new Error('A name needs 1 to 40 letters.');
  const old = c.name;
  c.name = next;
  return `${old} is now known as ${next}`;
}

export function renameFamily(world: World, h: Household, family: string): string {
  const next = family.trim().replace(/\s+/g, ' ');
  if (!next || next.length > 30) throw new Error('A family name needs 1 to 30 letters.');
  const old = h.family;
  h.family = next;
  // Their house takes the new name too ("Cooper cottage" becomes "Fletcher cottage").
  const place = world.land.places.find((p) => p.key === `home:${h.id}`);
  if (place?.label.startsWith(old)) place.label = next + place.label.slice(old.length);
  return `The ${old} family is now the ${next} family`;
}

/** Sets someone's purse to exactly `coins`, the difference coming from or going to the heavens. */
export function setCoins(world: World, c: Citizen, coins: number): string {
  alive(c);
  const target = Math.floor(coins);
  if (!Number.isFinite(target) || target < 0) throw new Error('Coins must be a whole number, 0 or more.');
  const diff = target - c.coins;
  if (diff > world.heavens.coins) throw new Error(`The heavens hold only ${world.heavens.coins} coins.`);
  if (diff > 0) transfer(world, world.heavens, c, diff, 'a gift from the heavens');
  if (diff < 0) transfer(world, c, world.heavens, -diff, 'taken by the heavens');
  return diff > 0 ? `The heavens gave ${c.name} ${diff} coins` : diff < 0 ? `The heavens took ${-diff} coins from ${c.name}` : `${c.name}'s purse is unchanged`;
}

/** Who `c` could be married to: living people of marrying age, single or widowed, not close kin. */
export function canMarry(world: World, data: GameData, c: Citizen): Citizen[] {
  const kin = new Set(kinOf(world, c).map((k) => k.person.id));
  const single = (x: Citizen) => x.spouseId === null || !world.citizens[x.spouseId]!.alive;
  const of = (x: Citizen) => x.age >= data.town.growth.marryAges[0];
  if (!of(c)) return [];
  return world.citizens.filter((x) => x !== c && x.alive && of(x) && single(x) && !kin.has(x.id));
}

/** Marries two people; `b` moves into `a`'s household. */
export function marry(world: World, data: GameData, a: Citizen, b: Citizen): string {
  alive(a);
  alive(b);
  if (a.age < data.town.growth.marryAges[0] || b.age < data.town.growth.marryAges[0]) throw new Error(`Nobody marries before ${data.town.growth.marryAges[0]}.`);
  if (!canMarry(world, data, a).includes(b)) throw new Error(`${a.name} and ${b.name} cannot marry: one is married or they are close kin.`);
  a.spouseId = b.id;
  b.spouseId = a.id;
  world.waiting = world.waiting.filter((n) => n.a !== a.id && n.b !== a.id && n.a !== b.id && n.b !== b.id);
  remember(world, a, 'married', { name: b.name.split(' ')[0]! });
  remember(world, b, 'married', { name: a.name.split(' ')[0]! });
  const h = householdOf(world, a);
  if (b.householdId !== h.id) moveOut(world, b, h);
  return `${a.name} married ${b.name}, who moved in with the ${h.family} household`;
}

/** Parts a married couple. They stay where they live. */
export function divorce(world: World, a: Citizen): string {
  if (a.spouseId === null) throw new Error(`${a.name} is not married.`);
  const b = world.citizens[a.spouseId]!;
  a.spouseId = null;
  if (b.spouseId === a.id) b.spouseId = null;
  world.waiting = world.waiting.filter((n) => n.a !== a.id && n.b !== a.id);
  return `${a.name} and ${b.name} have parted`;
}

/** Moves someone into another household. If it leaves their old house empty, it stands empty to let. */
export function moveToFamily(world: World, c: Citizen, to: Household): string {
  alive(c);
  if (c.householdId === to.id) throw new Error(`${c.name} already lives with the ${to.family} household.`);
  if (!livingMembers(world, to).length) throw new Error(`Nobody lives in the ${to.family} house now.`);
  moveOut(world, c, to);
  return `${c.name} moved in with the ${to.family} household`;
}

export function makeHead(world: World, data: GameData, c: Citizen): string {
  alive(c);
  if (!isAdult(data, c)) throw new Error('Only an adult can head a household.');
  const h = householdOf(world, c);
  if (h.headId === c.id) throw new Error(`${c.name} already heads the household.`);
  h.headId = c.id;
  return `${c.name} now heads the ${h.family} household`;
}
