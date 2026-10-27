// Work phase: each worker picks the most profitable recipe they can run and makes a traceable batch.
import { dailyLivingCost, observePrice, recipesOf, seenPrice, trait } from './agent';
import type { GameData } from './data';
import { recipeOutputMult } from './events';
import { remember } from './memory';
import { addLot, averageCost, makeBatch, stockOf, takeGoods } from './inventory';
import { random, roundRandom } from './rng';
import type { Citizen, GoodId, Lot, RecipeDef, World } from './types';

export function work(world: World, data: GameData, c: Citizen): void {
  c.workLog = [];
  if (!c.alive || !c.trade || c.sick) return; // the sick stay in bed
  const runs = data.town.trades[c.trade].batchesPerDay;
  for (let i = 0; i < runs; i++) {
    const r = chooseRecipe(world, data, c, true);
    if (!r) break;
    runRecipe(world, data, c, r);
  }
  c.needs.sleep = 0;
}

export function workingTool(c: Citizen, tool: GoodId): Lot | undefined {
  let best: Lot | undefined;
  for (const lot of c.inventory) {
    if (lot.good !== tool || !lot.durability) continue;
    if (!best || lot.durability < best.durability!) best = lot; // wear out the oldest first
  }
  return best;
}

export function outputTarget(data: GameData, r: RecipeDef, good: GoodId): number {
  return r.outputs[good]! * data.town.outputStockBatches;
}

export function ownPrice(data: GameData, c: Citizen, good: GoodId): number {
  return c.prices[good] ?? seenPrice(data, c, good);
}

/** Expected profit of one run, with a little personal noise so not everyone picks the same crop. */
export function expectedProfit(data: GameData, c: Citizen, r: RecipeDef, noise: number, eventMult = 1): number {
  let factor = eventMult;
  let cost = 0;
  if (r.tool) {
    const def = data.goods.get(r.tool)!;
    const tool = workingTool(c, r.tool);
    if (tool) cost += (tool.unitCost * (r.wear ?? 1)) / def.durability!;
    else factor = r.handFactor ?? 0;
  }
  for (const [g, q] of Object.entries(r.inputs)) cost += q * (averageCost(c, g) ?? seenPrice(data, c, g));
  let revenue = 0;
  for (const [g, q] of Object.entries(r.outputs)) revenue += q * factor * ownPrice(data, c, g);
  return (revenue - cost) * noise;
}

/** Recipes worth running now, best first: profitable and not already overstocked. */
export function rankRecipes(world: World, data: GameData, c: Citizen, needInputs: boolean): RecipeDef[] {
  const scored: { r: RecipeDef; p: number }[] = [];
  for (const r of recipesOf(data, c)) {
    if (Object.entries(r.outputs).every(([g]) => stockOf(c, g) >= outputTarget(data, r, g))) continue;
    if (needInputs && Object.entries(r.inputs).some(([g, q]) => stockOf(c, g) < q)) continue;
    const p = expectedProfit(data, c, r, 0.85 + 0.3 * random(world), recipeOutputMult(world, data, r.id));
    if (p > 0) scored.push({ r, p });
  }
  return scored.sort((a, b) => b.p - a.p).map((s) => s.r);
}

function chooseRecipe(world: World, data: GameData, c: Citizen, needInputs: boolean): RecipeDef | undefined {
  return rankRecipes(world, data, c, needInputs)[0];
}

export function runRecipe(world: World, data: GameData, c: Citizen, r: RecipeDef): void {
  let factor = 1;
  let cost = 0;
  if (r.tool) {
    const tool = workingTool(c, r.tool);
    if (tool) {
      const def = data.goods.get(r.tool)!;
      const wear = Math.min(r.wear ?? 1, tool.durability!);
      cost += (tool.unitCost * wear) / def.durability!;
      tool.durability! -= wear;
      if (tool.durability! <= 0) {
        c.inventory = c.inventory.filter((l) => l !== tool); // broken
        remember(world, c, 'tool_broke', { tool: r.tool });
      }
    } else {
      factor = r.handFactor ?? 0;
    }
  }
  // A day's labour is worth what the household needs to eat that day.
  cost += dailyLivingCost(world, data, c) / data.town.trades[c.trade!].batchesPerDay;
  const inputs: { batch: number; qty: number }[] = [];
  for (const [g, q] of Object.entries(r.inputs)) {
    for (const lot of takeGoods(c, g, q)) {
      inputs.push({ batch: lot.batch, qty: lot.qty });
      cost += lot.qty * lot.unitCost;
    }
  }
  const mult = factor * trait(data, c, 'outputMult') * recipeOutputMult(world, data, r.id);
  for (const [g, q] of Object.entries(r.outputs)) {
    const qty = roundRandom(world, q * mult);
    c.workLog?.push({ recipe: r.id, qty: Math.max(0, qty) });
    if (qty <= 0) continue;
    const batch = makeBatch(world, g, qty, c, r.id, inputs);
    const def = data.goods.get(g)!;
    const unitCost = cost / qty;
    if (def.kind === 'tool') {
      for (let i = 0; i < qty; i++) addLot(c, { batch: batch.id, good: g, qty: 1, unitCost, durability: def.durability! });
    } else {
      addLot(c, { batch: batch.id, good: g, qty, unitCost });
    }
    if (c.prices[g] === undefined) c.prices[g] = ownPrice(data, c, g);
    if (!c.seen[g]) observePrice(data, c, g, c.prices[g]!);
  }
}
