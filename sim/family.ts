// Families and households: who lives with whom, who is kin, and what happens when someone dies.
import { transfer } from './coins';
import { remember } from './memory';
import type { GameData } from './data';
import { random } from './rng';
import type { Citizen, Household, Trade, World } from './types';

export function householdOf(world: World, c: Citizen): Household {
  return world.households[c.householdId]!;
}

export function headOf(world: World, c: Citizen): Citizen {
  return world.citizens[householdOf(world, c).headId]!;
}

export function isHead(world: World, c: Citizen): boolean {
  return c.alive && householdOf(world, c).headId === c.id;
}

export function livingMembers(world: World, h: Household): Citizen[] {
  return h.memberIds.map((id) => world.citizens[id]!).filter((m) => m.alive);
}

export function isWorkingAge(data: GameData, c: Citizen): boolean {
  return c.age >= data.town.workingAge.adult && c.age < data.town.workingAge.elder;
}

export function isAdult(data: GameData, c: Citizen): boolean {
  return c.age >= data.town.workingAge.adult;
}

function alive(world: World, ids: number[]): Citizen[] {
  return ids.map((id) => world.citizens[id]!).filter((c) => c.alive);
}

export function childrenOf(world: World, c: Citizen): Citizen[] {
  return world.citizens.filter((k) => k.alive && k.parentIds.includes(c.id));
}

export function siblingsOf(world: World, c: Citizen): Citizen[] {
  if (!c.parentIds.length) return [];
  return world.citizens.filter((k) => k.alive && k !== c && k.parentIds.some((p) => c.parentIds.includes(p)));
}

/** Living kin, closest first: spouse, parents, children, siblings, grandparents, aunts and uncles, grandchildren, cousins. */
export function kinOf(world: World, c: Citizen): { person: Citizen; relation: string }[] {
  const out: { person: Citizen; relation: string }[] = [];
  const seen = new Set<Citizen>([c]);
  const add = (people: Citizen[], relation: string) => {
    for (const p of people) if (!seen.has(p)) { seen.add(p); out.push({ person: p, relation }); }
  };
  const parents = c.parentIds.map((id) => world.citizens[id]!);
  add(c.spouseId !== null ? alive(world, [c.spouseId]) : [], 'spouse');
  add(parents.filter((p) => p.alive), 'parent');
  add(childrenOf(world, c), 'child');
  add(siblingsOf(world, c), 'sibling');
  add(alive(world, parents.flatMap((p) => p.parentIds)), 'grandparent');
  add(parents.flatMap((p) => siblingsOf(world, p)), 'aunt or uncle');
  add(childrenOf(world, c).flatMap((k) => childrenOf(world, k)), 'grandchild');
  add(parents.flatMap((p) => siblingsOf(world, p)).flatMap((a) => childrenOf(world, a)), 'cousin');
  return out;
}

/** If B is A's <relation>, then A is B's <inverse>. */
export function inverseRelation(relation: string): string {
  return ({ parent: 'child', child: 'parent', grandparent: 'grandchild', grandchild: 'grandparent', 'aunt or uncle': 'niece or nephew' } as Record<string, string>)[relation] ?? relation;
}

export function moveToHousehold(world: World, c: Citizen, to: Household): void {
  const from = householdOf(world, c);
  from.memberIds = from.memberIds.filter((id) => id !== c.id);
  to.memberIds.push(c.id);
  c.householdId = to.id;
}

/** Hands a dead person's coins and goods to someone, as a recorded transfer. */
function passEstate(world: World, dead: Citizen, heir: Citizen): void {
  if (dead.coins > 0) transfer(world, dead, heir, dead.coins, `inheritance from ${dead.name}`);
  for (const lot of dead.inventory) heir.inventory.push(lot);
  dead.inventory = [];
  for (const [g, p] of Object.entries(dead.prices)) heir.prices[g] ??= p;
}

export function takeUpTrade(data: GameData, c: Citizen, trade: Trade | null): void {
  c.trade = trade;
  if (!trade) return;
  for (const r of data.recipesByTrade[trade]) {
    for (const g of Object.keys(r.outputs)) c.prices[g] ??= c.seen[g]?.avg ?? data.goods.get(g)!.basePrice;
  }
}

/**
 * Runs after a death. The household passes to the spouse, then the eldest adult child, then the eldest adult.
 * Children left without an adult move in with their closest kin, or are fostered by another household.
 */
export function afterDeath(world: World, data: GameData, dead: Citizen): string[] {
  const events: string[] = [];
  const h = householdOf(world, dead);
  const rest = livingMembers(world, h);
  if (h.headId !== dead.id) {
    const head = world.citizens[h.headId]!;
    if (head.alive) passEstate(world, dead, head);
    return events;
  }
  const byAge = (a: Citizen, b: Citizen) => b.age - a.age;
  const adults = rest.filter((m) => isAdult(data, m));
  const heir =
    adults.find((m) => m.id === dead.spouseId) ??
    adults.filter((m) => m.parentIds.includes(dead.id)).sort(byAge)[0] ??
    adults.sort(byAge)[0];
  if (heir) {
    h.headId = heir.id;
    passEstate(world, dead, heir);
    events.push(`${heir.name} now heads the ${h.family} household`);
    if (!heir.trade && dead.trade && isWorkingAge(data, heir)) {
      takeUpTrade(data, heir, dead.trade);
      events.push(`${heir.name} takes over the family trade (${dead.trade})`);
    }
    return events;
  }
  if (!rest.length) return events; // nobody left: the estate stays frozen, still counted in total coins
  // Only children are left. Find them a home with kin, or failing that a foster household.
  const kin = rest.flatMap((child) => kinOf(world, child)).map((k) => k.person)
    .find((p) => isAdult(data, p) && p.householdId !== h.id);
  const others = world.households.filter((o) => o !== h && livingMembers(world, o).some((m) => isAdult(data, m)));
  const foster = kin ? householdOf(world, kin) : others[Math.floor(random(world) * others.length)];
  if (!foster) return events;
  const newHead = world.citizens[foster.headId]!;
  passEstate(world, dead, newHead);
  for (const child of rest) {
    moveToHousehold(world, child, foster);
    remember(world, child, 'moved_in', { name: kin?.name ?? newHead.name });
  }
  const who = rest.map((c) => c.name).join(', ');
  const one = rest.length === 1;
  events.push(kin
    ? `${who} ${one ? 'moves' : 'move'} in with ${kin.name} (${kinOf(world, rest[0]!).find((k) => k.person === kin)?.relation ?? 'kin'})`
    : `${who} ${one ? 'is' : 'are'} taken in by the ${foster.family} household`);
  return events;
}
