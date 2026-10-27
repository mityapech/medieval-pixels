// Follows a batch back through its inputs to everyone who had a hand in making it.
import type { Batch, BatchId, World } from './types';

export interface TraceStep {
  batch: Batch;
  makerName: string;
  depth: number;
}

export function traceBatch(world: World, id: BatchId, depth = 0, out: TraceStep[] = []): TraceStep[] {
  const batch = world.batches.get(id);
  if (!batch) throw new Error(`unknown batch ${id}`);
  const makerName = batch.maker >= 0 ? world.citizens[batch.maker]!.name : `imported from ${batch.origin}`;
  out.push({ batch, makerName, depth });
  for (const input of batch.inputs) traceBatch(world, input.batch, depth + 1, out);
  return out;
}
