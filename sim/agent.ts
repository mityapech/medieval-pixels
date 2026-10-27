// Helpers that describe one citizen's situation: traits, household, what they need and what they can sell.
import type { GameData } from './data';
import { stockOf } from './inventory';
import { householdNeedMult } from './events';
import { householdOf, isHead, livingMembers } from './family';
import type { Citizen, GoodId, RecipeDef, World } from './types';

export function trait(data: GameData, c: Citizen, key: 'outputMult' | 'priceStepMult' | 'jobChangeMult'): number {
  let m = 1;
  for (const id of c.traits) m *= data.traits.get(id)?.[key] ?? 1;
  return m;
}

export function traitSum(data: GameData, c: Citizen, key: 'marginBonus' | 'extraVisits' | 'extraFoodDays'): number {
  let s = 0;
  for (const id of c.traits) s += data.traits.get(id)?.[key] ?? 0;
  return s;
}

/** How many people this citizen buys food for: the whole household if they head it, otherwise nobody. */
export function householdSize(world: World, c: Citizen): number {
  return isHead(world, c) ? livingMembers(world, householdOf(world, c)).length : 0;
}

/** Heads shop for the household; anyone with a trade also shops for tools and inputs. */
export function shopsForSelf(world: World, c: Citizen): boolean {
  return c.alive && (isHead(world, c) || c.trade !== null);
}

/** Anything with nutrition can be eaten: baked goods, and raw vegetables and fruit for those who cannot afford better. */
export function isFood(data: GameData, good: GoodId): boolean {
  return (data.goods.get(good)!.nutrition ?? 0) > 0;
}

/** Whether this citizen's trade uses the good as an input (a baker's vegetables are for pies, not supper). */
export function isWorkInput(data: GameData, c: Citizen, good: GoodId): boolean {
  return recipesOf(data, c).some((r) => r.inputs[good]);
}

/** Meals the citizen holds for the household, not counting their trade's inputs. */
export function foodStock(data: GameData, c: Citizen): number {
  let n = 0;
  for (const lot of c.inventory) {
    if (isFood(data, lot.good) && !isWorkInput(data, c, lot.good)) n += lot.qty * data.goods.get(lot.good)!.nutrition!;
  }
  return n;
}

export function foodTarget(world: World, data: GameData, c: Citizen): number {
  return householdSize(world, c) * (data.town.foodStockDays + traitSum(data, c, 'extraFoodDays'));
}

export function recipesOf(data: GameData, c: Citizen): RecipeDef[] {
  return c.trade ? data.recipesByTrade[c.trade] : [];
}

export function seenPrice(data: GameData, c: Citizen, good: GoodId): number {
  return c.seen[good]?.avg ?? data.goods.get(good)!.basePrice;
}

export function observePrice(data: GameData, c: Citizen, good: GoodId, price: number): void {
  const s = c.seen[good];
  const w = data.town.pricing.memoryWeight;
  if (!s) c.seen[good] = { avg: price, count: 1 };
  else {
    s.avg = s.avg * (1 - w) + price * w;
    s.count++;
  }
}

export function cheapestMeal(data: GameData, c: Citizen): number {
  let best = Infinity;
  for (const g of data.goods.values()) if (isFood(data, g.id)) best = Math.min(best, seenPrice(data, c, g.id) / g.nutrition!);
  return best;
}

/** Coins kept back from business spending so the household can still eat for a while. */
export function foodReserveCoins(world: World, data: GameData, c: Citizen): number {
  return Math.ceil(data.town.reserveDays * Math.max(1, householdSize(world, c)) * cheapestMeal(data, c));
}

/** This worker's share of what their household spends on food per day (split between its earners). */
export function dailyLivingCost(world: World, data: GameData, c: Citizen): number {
  const members = livingMembers(world, householdOf(world, c));
  const earners = Math.max(1, members.filter((m) => m.trade).length);
  return (members.length / earners) * cheapestMeal(data, c);
}

/** Firewood and other things the household burns or uses up each day, which its head keeps in stock. */
export function householdNeedTarget(world: World, data: GameData, c: Citizen, good: GoodId): number {
  if (!isHead(world, c)) return 0;
  const need = data.town.householdNeeds.find((n) => n.good === good);
  return need ? Math.round(need.perHouseholdPerDay * householdNeedMult(world, data, good)) * need.stockDays : 0;
}

/** How many units of a good the citizen keeps for their own use (food, work inputs, one working tool). */
export function keepAmount(world: World, data: GameData, c: Citizen, good: GoodId): number {
  for (const r of recipesOf(data, c)) {
    if (r.inputs[good]) return Infinity;
    if (r.tool === good) return 1;
  }
  // Builders keep their building materials for the next job.
  if (c.trade === 'builder' && data.town.construction.materials[good]) return Infinity;
  // Anyone selling food (bakers, farmers, merchants) keeps enough for their own household.
  if (isFood(data, good)) return foodTarget(world, data, c);
  return householdNeedTarget(world, data, c, good);
}

export function sellableQty(world: World, data: GameData, c: Citizen, good: GoodId): number {
  if (!c.alive) return 0;
  return Math.max(0, stockOf(c, good) - keepAmount(world, data, c, good));
}

/** Goods this trade makes, so other people know to visit them for it. */
export function makesGood(data: GameData, c: Citizen, good: GoodId): boolean {
  return recipesOf(data, c).some((r) => r.outputs[good]);
}
