// What citizens remember: things that happened to them, which they may talk about later.
import type { Citizen, World } from './types';

const KEEP = 20;
const SAME_WITHIN_DAYS = 7;

/** Records a memory. The same kind of thing with the same details within a week only refreshes the old one. */
export function remember(world: World, c: Citizen, kind: string, params: Record<string, string | number> = {}): void {
  const same = c.memories.find((m) => m.kind === kind && world.day - m.day < SAME_WITHIN_DAYS
    && Object.entries(params).every(([k, v]) => m.params[k] === v));
  if (same) {
    same.day = world.day;
    return;
  }
  c.memories.push({ day: world.day, kind, params });
  if (c.memories.length > KEEP) c.memories.shift();
}
