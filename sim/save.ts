// Saving and loading a town, and keeping a long-running town small. A town played for years in the browser would
// otherwise grow without end (every payment, conversation and goods record is kept), so compact() trims what is no
// longer needed: old payments, old conversations, the detail of old daily reports (their numbers stay for the
// charts), and records of goods nobody holds any more (anything still held can still be traced back).
import { HEAVENS_PURSE } from './god';
import type { Batch, BatchId, World } from './types';

const VERSION = 1;

export function compact(world: World, keep = { ledgerDays: 3, talkDays: 30, detailDays: 3 }): void {
  const day = world.day;
  world.ledger = world.ledger.filter((e) => day - e.day < keep.ledgerDays);
  world.conversations = world.conversations.filter((c) => day - c.day < keep.talkDays);
  for (const r of world.reports) {
    if (day - r.day < keep.detailDays) continue;
    r.conversations = [];
    r.adverts = [];
    r.jobChanges = [];
    r.familyEvents = [];
    r.propertySales = [];
  }
  // Keep the goods records anyone still holds, and everything they were made from.
  const needed = new Set<BatchId>();
  const visit = (id: BatchId) => {
    if (needed.has(id)) return;
    needed.add(id);
    for (const input of world.batches.get(id)?.inputs ?? []) visit(input.batch);
  };
  for (const holder of [...world.citizens, world.granary]) for (const lot of holder.inventory) visit(lot.batch);
  for (const id of [...world.batches.keys()]) if (!needed.has(id)) world.batches.delete(id);
}

/** The town as text, for browser storage. */
export function saveWorld(world: World, name: string): string {
  return JSON.stringify({ version: VERSION, name, savedAt: Date.now(), world: { ...world, batches: [...world.batches.entries()] } });
}

/** A saved town back as a world, or undefined if the save is unreadable or from an incompatible version. */
export function loadWorld(text: string): { world: World; name: string; savedAt: number } | undefined {
  try {
    const raw = JSON.parse(text) as { version: number; name: string; savedAt: number; world: World & { batches: [BatchId, Batch][] } };
    if (raw.version !== VERSION) return undefined;
    const world = { ...raw.world, batches: new Map(raw.world.batches) } as World;
    // Records added to the town since this save was made start empty.
    world.decrees ??= [];
    world.elections ??= [];
    if (!world.heavens) {
      world.heavens = { key: 'heavens', name: 'The heavens', coins: HEAVENS_PURSE };
      world.initialCoins += HEAVENS_PURSE;
    }
    return { world, name: raw.name, savedAt: raw.savedAt };
  } catch {
    return undefined;
  }
}
