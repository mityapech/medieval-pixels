// Where things are on the map. The simulation has no land yet (that is the land milestone), so the renderer
// lays the town out itself: shared places around a market square, and one house per household around them.
import type { Trade, World } from '../../sim/index';

export const TILE = 32;
export const MAP_W = 44;
export const MAP_H = 30;

export interface Place {
  key: string;
  label: string;
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SHARED: Place[] = [
  { key: 'market', label: 'Market square', sprite: 'market', x: 18, y: 12, w: 8, h: 5 },
  { key: 'church', label: 'Church', sprite: 'church', x: 19, y: 4, w: 4, h: 5 },
  { key: 'granary', label: 'Granary', sprite: 'granary', x: 24, y: 5, w: 3, h: 3 },
  { key: 'work:farmer', label: 'Fields', sprite: 'fields', x: 2, y: 2, w: 10, h: 9 },
  { key: 'work:laborer', label: 'Woods and quarry', sprite: 'woods', x: 33, y: 2, w: 9, h: 9 },
  { key: 'work:baker', label: 'Bakery', sprite: 'bakery', x: 13, y: 20, w: 3, h: 3 },
  { key: 'work:blacksmith', label: 'Smithy', sprite: 'smithy', x: 28, y: 20, w: 3, h: 3 },
  { key: 'work:merchant', label: "Merchants' row", sprite: 'merchants', x: 18, y: 18, w: 8, h: 2 },
];

/** House plots, 3x3 tiles each, in rows around the centre. Enough for every household a 60-person town makes. */
function houseSlots(): { x: number; y: number }[] {
  const slots: { x: number; y: number }[] = [];
  for (const y of [23, 26]) for (let x = 2; x <= 40; x += 4) slots.push({ x, y });
  for (const y of [13, 17]) for (const x of [2, 6, 10, 14, 29, 33, 37]) slots.push({ x, y });
  return slots;
}

export function layoutTown(world: World): Map<string, Place> {
  const places = new Map<string, Place>();
  for (const p of SHARED) places.set(p.key, p);
  const slots = houseSlots();
  world.households.forEach((h, i) => {
    const s = slots[i % slots.length]!;
    places.set(`home:${h.id}`, { key: `home:${h.id}`, label: `${h.family} house`, sprite: 'house', x: s.x, y: s.y, w: 3, h: 3 });
  });
  return places;
}

export function centre(p: Place): { x: number; y: number } {
  return { x: (p.x + p.w / 2) * TILE, y: (p.y + p.h / 2) * TILE };
}

/** A spot inside a place for one person, spread out so a crowd does not stack on one point. */
export function spotIn(p: Place, id: number): { x: number; y: number } {
  const cols = Math.max(1, p.w * 2 - 1);
  const rows = Math.max(1, p.h * 2 - 1);
  const k = (id * 7919) % (cols * rows);
  return { x: (p.x + 0.5 + (k % cols) / 2) * TILE, y: (p.y + 0.5 + Math.floor(k / cols) / 2) * TILE };
}

export const WORKPLACE: Record<Trade, string> = {
  farmer: 'work:farmer', baker: 'work:baker', laborer: 'work:laborer', blacksmith: 'work:blacksmith', merchant: 'work:merchant',
};
