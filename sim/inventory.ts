// Inventory of lots, and batch records for traceability.
import type { Batch, BatchId, Citizen, GoodId, Lot, World } from './types';

export function stockOf(c: Citizen, good: GoodId): number {
  let n = 0;
  for (const lot of c.inventory) if (lot.good === good) n += lot.qty;
  return n;
}

export function addLot(c: Citizen, lot: Lot): void {
  if (lot.qty <= 0) return;
  // Tools stay as separate items; other goods from the same batch at the same cost merge.
  const same = lot.durability === undefined
    ? c.inventory.find((l) => l.batch === lot.batch && l.unitCost === lot.unitCost && l.durability === undefined)
    : undefined;
  if (same) same.qty += lot.qty;
  else c.inventory.push({ ...lot });
}

/** Removes qty of a good, oldest first. Returns what was taken, batch by batch. */
export function takeGoods(c: Citizen, good: GoodId, qty: number): Lot[] {
  const taken: Lot[] = [];
  let left = qty;
  for (const lot of c.inventory) {
    if (left <= 0) break;
    if (lot.good !== good || lot.qty <= 0) continue;
    const n = Math.min(lot.qty, left);
    lot.qty -= n;
    left -= n;
    taken.push({ ...lot, qty: n });
  }
  if (left > 0) throw new Error(`${c.name} lacks ${left} ${good}`);
  c.inventory = c.inventory.filter((l) => l.qty > 0);
  return taken;
}

/** Moves goods between people, keeping their batch (so they stay traceable) but resetting cost to the price paid. */
export function moveGoods(from: Citizen, to: Citizen, good: GoodId, qty: number, unitPrice: number): void {
  for (const lot of takeGoods(from, good, qty)) addLot(to, { ...lot, unitCost: unitPrice });
}

export function makeBatch(
  world: World,
  good: GoodId,
  qty: number,
  maker: Citizen,
  recipe: string,
  inputs: { batch: BatchId; qty: number }[],
): Batch {
  const batch: Batch = { id: world.nextBatchId++, good, qty, maker: maker.id, recipe, inputs, day: world.day };
  world.batches.set(batch.id, batch);
  return batch;
}

/** A batch bought from a neighbouring town: no maker in this town, but the record says where it came from. */
export function makeImportBatch(world: World, good: GoodId, qty: number, origin: string): Batch {
  const batch: Batch = { id: world.nextBatchId++, good, qty, maker: -1, origin, recipe: 'import', inputs: [], day: world.day };
  world.batches.set(batch.id, batch);
  return batch;
}

export function averageCost(c: Citizen, good: GoodId): number | undefined {
  let qty = 0;
  let cost = 0;
  for (const lot of c.inventory) {
    if (lot.good !== good) continue;
    qty += lot.qty;
    cost += lot.qty * lot.unitCost;
  }
  return qty > 0 ? cost / qty : undefined;
}
