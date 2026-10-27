// The neighbouring towns, simulated simply: a purse and a drifting price list. Merchants import and export through them.
import type { GameData } from './data';
import { neighbourPriceMult, roadCostMult } from './events';
import { random } from './rng';
import type { GoodId, Neighbour, World } from './types';

/** Prices wander a little each day and drift back towards a normal level a bit above our base prices. */
export function driftNeighbourPrices(world: World, data: GameData): void {
  const { dailyDrift, priceSpread } = data.town.neighbours;
  const anchor = (priceSpread[0] + priceSpread[1]) / 2;
  for (const n of world.neighbours) {
    for (const g of Object.keys(n.prices)) {
      const base = data.goods.get(g)!.basePrice * anchor;
      const p = n.prices[g]! * (1 + dailyDrift * (random(world) * 2 - 1));
      n.prices[g] = p + 0.05 * (base - p);
    }
  }
}

function road(world: World, data: GameData): number {
  return data.town.neighbours.roadCost * roadCostMult(world, data);
}

/** The cheapest place to buy a good, and what it costs per unit delivered here (whole coins). */
export function bestImport(world: World, data: GameData, good: GoodId): { from: Neighbour; unitCost: number } | undefined {
  let best: { from: Neighbour; unitCost: number } | undefined;
  for (const n of world.neighbours) {
    const unitCost = Math.ceil(n.prices[good]! * neighbourPriceMult(world, data, good) * (1 + road(world, data)));
    if (!best || unitCost < best.unitCost) best = { from: n, unitCost };
  }
  return best;
}

/** The best place to sell a good, and what it fetches per unit after the road (whole coins). */
export function bestExport(world: World, data: GameData, good: GoodId, qty: number): { to: Neighbour; unitPrice: number } | undefined {
  let best: { to: Neighbour; unitPrice: number } | undefined;
  for (const n of world.neighbours) {
    const unitPrice = Math.floor(n.prices[good]! * neighbourPriceMult(world, data, good) * (1 - road(world, data)));
    if (unitPrice <= 0 || n.coins < unitPrice * qty) continue;
    if (!best || unitPrice > best.unitPrice) best = { to: n, unitPrice };
  }
  return best;
}
