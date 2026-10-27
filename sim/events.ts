// Random events: they start by chance, last a while, and change production, needs and the roads while active.
import type { GameData } from './data';
import { livingMembers } from './family';
import { random, randomInt } from './rng';
import type { EventDef, GoodId, World } from './types';

function guards(world: World): number {
  return world.citizens.filter((c) => c.alive && c.office === 'guard').length;
}

/** How much of an event's effect gets through, after the militia does its part. */
function strength(world: World, def: EventDef): number {
  return def.guardMitigation ? Math.max(0, 1 - guards(world) * def.guardMitigation) : 1;
}

function activeDefs(world: World, data: GameData): EventDef[] {
  return world.events.map((e) => data.events.find((d) => d.id === e.id)!).filter(Boolean);
}

/** Ends finished events and maybe starts new ones. Returns descriptions of what started today. */
export function rollEvents(world: World, data: GameData): string[] {
  world.events = world.events.filter((e) => e.endsOnDay >= world.day);
  const started: string[] = [];
  for (const def of data.events) {
    if (world.events.some((e) => e.id === def.id) || random(world) >= def.chance) continue;
    const [lo, hi] = def.durationDays;
    world.events.push({ id: def.id, name: def.name, endsOnDay: world.day + lo + randomInt(world, hi - lo + 1) - 1 });
    let text = def.name;
    if (def.householdLoss) text += burnHousehold(world, def.householdLoss * strength(world, def));
    started.push(text);
  }
  return started;
}

/** A house fire: one household loses a share of everything its members hold (goods only; coins survive). */
function burnHousehold(world: World, share: number): string {
  const homes = world.households.filter((h) => livingMembers(world, h).length);
  if (!homes.length || share <= 0) return ' (the watch put it out)';
  const h = homes[randomInt(world, homes.length)]!;
  for (const m of livingMembers(world, h)) {
    for (const lot of m.inventory) lot.qty -= Math.round(lot.qty * share);
    m.inventory = m.inventory.filter((l) => l.qty > 0);
  }
  return ` at the ${h.family} house: ${Math.round(share * 100)}% of their stores lost`;
}

export function recipeOutputMult(world: World, data: GameData, recipe: string): number {
  let m = 1;
  for (const def of activeDefs(world, data)) {
    const f = def.recipeOutput?.[recipe];
    if (f !== undefined) m *= 1 + (f - 1) * strength(world, def);
  }
  return m;
}

export function householdNeedMult(world: World, data: GameData, good: GoodId): number {
  let m = 1;
  for (const def of activeDefs(world, data)) m *= def.householdNeed?.[good] ?? 1;
  return m;
}

export function neighbourPriceMult(world: World, data: GameData, good: GoodId): number {
  let m = 1;
  for (const def of activeDefs(world, data)) m *= def.neighbourPrice?.[good] ?? 1;
  return m;
}

export function roadCostMult(world: World, data: GameData): number {
  let m = 1;
  for (const def of activeDefs(world, data)) if (def.roadCost) m *= 1 + (def.roadCost - 1) * strength(world, def);
  return m;
}
