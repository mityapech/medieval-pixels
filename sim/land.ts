// The land: terrain, roads and where every building stands, generated from the seed so each town is different.
// The town is a walled lakeside town: a lake on one edge, a canal through the middle with boardwalks and bridges,
// docks on the shore, a stone wall with gates where the roads come in, houses packed irregularly inside it,
// and fields and woods outside. Generation has its own random stream, so the map never changes the economy.
import type { GameData } from './data';
import { livingMembers } from './family';
import type { Land, Place, Terrain, World } from './types';

const W = 60;
const H = 44;

/** A small seeded generator (mulberry32), separate from the world's. */
function stream(seed: number): () => number {
  let s = (seed ^ 0x9e3779b9) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in [0, 1]: a few octaves of interpolated random lattices. */
function noiseField(rand: () => number, octaves: number[]): number[] {
  const out = new Array<number>(W * H).fill(0);
  let total = 0;
  for (const [i, cell] of octaves.entries()) {
    const weight = 1 / (i + 1);
    total += weight;
    const gw = Math.ceil(W / cell) + 2;
    const gh = Math.ceil(H / cell) + 2;
    const lattice = Array.from({ length: gw * gh }, rand);
    const ox = rand() * cell;
    const oy = rand() * cell;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fx = (x + ox) / cell;
        const fy = (y + oy) / cell;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const sx = smooth(fx - x0);
        const sy = smooth(fy - y0);
        const at = (gx: number, gy: number) => lattice[gy * gw + gx]!;
        const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
        const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
        out[y * W + x]! += weight * (top * (1 - sy) + bottom * sy);
      }
    }
  }
  return out.map((v) => v / total);
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const idx = (x: number, y: number) => y * W + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

/** Lays out the land and the town for this world's seed and households. */
export function generateLand(world: World, data: GameData): Land {
  const rand = stream(world.seed);
  const height = noiseField(rand, [14, 7, 3]);
  const wet = noiseField(rand, [16, 8]);
  const edgeNoise = noiseField(rand, [6, 3]);
  const terrain = new Array<Terrain>(W * H).fill('grass');
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

  // The lake fills one edge of the map with a ragged shore.
  const lakeSide = Math.floor(rand() * 4); // 0 left, 1 top, 2 right, 3 bottom
  const fromLake = (x: number, y: number) => [x, y, W - 1 - x, H - 1 - y][lakeSide]!;
  const lakeDepth = 6 + rand() * 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (fromLake(x, y) + edgeNoise[idx(x, y)]! * 7 < lakeDepth + 3.5) terrain[idx(x, y)] = 'water';
  }

  // The town sits on the shore: its centre a little way in from the lake, its wall a wobbly ring.
  const along = 0.35 + rand() * 0.3;
  const inward = lakeDepth + 14 + rand() * 2;
  const [cx, cy] = [[inward, H * along], [W * along, inward], [W - 1 - inward, H * along], [W * along, H - 1 - inward]][lakeSide]! as [number, number];
  const rx = 13 + rand() * 2;
  const ry = 10 + rand() * 2;
  const wobble = Array.from({ length: 12 }, () => 0.88 + rand() * 0.2);
  const radiusAt = (a: number) => {
    const t = ((a / (Math.PI * 2)) * 12 + 12) % 12;
    const i = Math.floor(t);
    const f = smooth(t - i);
    return wobble[i]! * (1 - f) + wobble[(i + 1) % 12]! * f;
  };
  /** 0 at the centre, 1 on the wall line, more outside. */
  const ring = (x: number, y: number) => {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    return Math.hypot(dx, dy) / radiusAt(Math.atan2(dy, dx));
  };
  const inTown = (x: number, y: number) => ring(x, y) < 0.94;

  // Woods and rock outside the wall; open ground inside it.
  const woodsSide = rand() * Math.PI * 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (terrain[i] === 'water' || ring(x, y) < 1.15) continue;
    const towardsWoods = ((x / W - 0.5) * Math.cos(woodsSide) + (y / H - 0.5) * Math.sin(woodsSide)) * 2;
    if (height[i]! > 0.7) terrain[i] = 'rock';
    else if (wet[i]! * 0.6 + towardsWoods * 0.55 > 0.5) terrain[i] = 'forest';
  }

  // The canal: from the lake, through the middle of town, out the far side, bending as it goes.
  const canalNoise = noiseField(rand, [4]);
  const lakeEntry = [[0, cy], [cx, 0], [W - 1, cy], [cx, H - 1]][lakeSide]!;
  const farSide = [[W - 1, cy + (rand() - 0.5) * 10], [cx + (rand() - 0.5) * 10, H - 1], [0, cy + (rand() - 0.5) * 10], [cx + (rand() - 0.5) * 10, 0]][lakeSide]!;
  const canal = new Set<number>();
  const canalOffset = (rand() - 0.5) * 6;
  const mid = lakeSide % 2 === 0 ? { x: Math.round(cx), y: Math.round(cy + canalOffset) } : { x: Math.round(cx + canalOffset), y: Math.round(cy) };
  for (const [a, b] of [[{ x: Math.round(lakeEntry[0]!), y: Math.round(lakeEntry[1]!) }, mid], [mid, { x: Math.round(farSide[0]!), y: Math.round(Math.max(0, Math.min(H - 1, farSide[1]!))) }]] as const) {
    const bx = Math.max(0, Math.min(W - 1, b.x));
    const by = Math.max(0, Math.min(H - 1, b.y));
    for (const t of path(a, { x: bx, y: by }, (x, y) => 1 + canalNoise[idx(x, y)]! * 4)) canal.add(t);
  }
  for (const t of canal) terrain[t] = 'water';

  // The wall: every tile just outside the town that borders a tile inside it, so it closes completely,
  // except over water (the canal passes under a water gate).
  const wall = new Set<number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inTown(x, y) || terrain[idx(x, y)] === 'water') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx!, y + dy!) && inTown(x + dx!, y + dy!))) wall.add(idx(x, y));
  }

  const occupied = new Uint8Array(W * H);
  for (const t of wall) occupied[t] = 1;
  const places: Place[] = [];
  const land: Terrain[] = ['grass'];
  const fits = (x: number, y: number, w: number, h: number, allow: Terrain[], within?: boolean) => {
    if (x < 1 || y < 1 || x + w > W - 1 || y + h > H - 1) return false;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (occupied[idx(i, j)] || !allow.includes(terrain[idx(i, j)]!)) return false;
        if (within !== undefined && inTown(i, j) !== within) return false;
      }
    }
    return true;
  };
  const claim = (p: Place, margin = 1) => {
    places.push(p);
    for (let j = p.y - margin; j < p.y + p.h + margin; j++) {
      for (let i = p.x - margin; i < p.x + p.w + margin; i++) if (inside(i, j)) occupied[idx(i, j)] = 1;
    }
  };
  /** The best-scoring free rectangle among many random tries; within = true for inside the wall, false for outside. */
  const pick = (w: number, h: number, allow: Terrain[], within: boolean | undefined, score: (x: number, y: number) => number, tries = 900) => {
    let best: { x: number; y: number; s: number } | undefined;
    for (let t = 0; t < tries; t++) {
      const x = 1 + Math.floor(rand() * (W - w - 1));
      const y = 1 + Math.floor(rand() * (H - h - 1));
      if (!fits(x, y, w, h, allow, within)) continue;
      const s = score(x + w / 2, y + h / 2) + rand() * 0.5;
      if (!best || s > best.s) best = { x, y, s };
    }
    return best;
  };
  /** Like pick, but if nothing fits, try anywhere on dry ground and clear it. */
  const pickOrClear = (w: number, h: number, allow: Terrain[], within: boolean | undefined, score: (x: number, y: number) => number) => {
    const at = pick(w, h, allow, within, score) ?? pick(w, h, ['grass', 'forest', 'rock'], within, score, 4000) ?? pick(w, h, ['grass', 'forest', 'rock'], undefined, score, 6000);
    if (at) for (let j = at.y; j < at.y + h; j++) for (let i = at.x; i < at.x + w; i++) terrain[idx(i, j)] = 'grass';
    return at;
  };
  const canalNear = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (canal.has(idx(Math.floor(x) + dx, Math.floor(y) + dy))) return true;
    return false;
  };

  // Inside the wall: the market square by the canal in the middle, the church, granary, merchants' row and bakery near it,
  // the smithy against the wall (fire). Outside: fields on open ground, woods and quarry in the forest.
  const mk = pickOrClear(7, 5, land, true, (x, y) => -dist(x, y, cx, cy) * 0.6 + (canalNear(x, y, 4) ? 3 : 0))!;
  const market: Place = { key: 'market', label: 'Market square', sprite: 'market', x: mk.x, y: mk.y, w: 7, h: 5 };
  claim(market);
  const mx = market.x + market.w / 2;
  const my = market.y + market.h / 2;
  const near = (r: number) => (x: number, y: number) => -Math.abs(dist(x, y, mx, my) - r);
  const shared: [string, string, string, number, number, (x: number, y: number) => number][] = [
    ['church', 'Church', 'church', 4, 5, near(6)],
    ['work:merchant', "Merchants' row", 'merchants', 6, 2, near(5)],
    ['granary', 'Granary', 'granary', 3, 3, near(8)],
    ['work:baker', 'Bakery', 'bakery', 3, 3, near(7)],
    ['work:blacksmith', 'Smithy', 'smithy', 3, 3, (x, y) => -Math.abs(ring(x, y) - 0.78) * 20],
  ];
  for (const [key, label, sprite, w, h, score] of shared) {
    const at = pickOrClear(w, h, land, true, score);
    if (at) claim({ key, label, sprite, x: at.x, y: at.y, w, h });
  }
  const share = (x: number, y: number, r: number, kind: Terrain) => {
    let n = 0, all = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!inside(Math.floor(x) + dx, Math.floor(y) + dy)) continue;
      all++;
      if (terrain[idx(Math.floor(x) + dx, Math.floor(y) + dy)] === kind) n++;
    }
    return all ? n / all : 0;
  };
  const woods = pickOrClear(9, 7, ['forest', 'grass', 'rock'], false, (x, y) => share(x, y, 5, 'forest') * 10 + share(x, y, 6, 'rock') * 6 - dist(x, y, cx, cy) * 0.08);
  if (woods) claim({ key: 'work:laborer', label: 'Woods and quarry', sprite: 'woods', x: woods.x, y: woods.y, w: 9, h: 7 });
  const fields = pickOrClear(11, 8, land, false, (x, y) => wet[idx(Math.floor(x), Math.floor(y))]! * 3 - Math.abs(ring(x, y) - 1.7) * 4);
  if (fields) claim({ key: 'work:farmer', label: 'Fields', sprite: 'fields', x: fields.x, y: fields.y, w: 11, h: 8 });

  // Roads. First the roads out to the neighbouring towns: where they cross the wall stands a gate.
  const building = new Int16Array(W * H).fill(-1);
  places.forEach((p, n) => { for (let j = p.y; j < p.y + p.h; j++) for (let i = p.x; i < p.x + p.w; i++) building[idx(i, j)] = n; });
  const roads = new Uint8Array(W * H);
  const gates = new Set<number>();
  const roadNoise = noiseField(rand, [5]);
  const start = { x: Math.floor(mx), y: Math.floor(my) };
  const lay = (to: { x: number; y: number }, wallCost: (t: number) => number) => {
    const goal = building[idx(to.x, to.y)];
    const route = path(start, to, (x, y) => {
      const t = idx(x, y);
      const b = building[t]!;
      if (b >= 0 && places[b] !== market && b !== goal) return 40;
      if (wall.has(t)) return wallCost(t);
      const ter = terrain[t];
      const base = roads[t] ? 0.3 : ter === 'water' ? (canal.has(t) ? 3 : 60) : ter === 'rock' ? 4 : ter === 'forest' ? 2.5 : 1;
      return base + roadNoise[t]! * 1.5;
    });
    for (const t of route) {
      if (building[t]! >= 0) continue;
      roads[t] = 1;
      if (wall.has(t)) { gates.add(t); wall.delete(t); }
    }
  };
  const awayFromLake = [0, 1, 2, 3].filter((s) => s !== lakeSide);
  const edges = Math.min(data.town.neighbours.names.length, 3);
  for (let k = 0; k < edges; k++) {
    const side = awayFromLake[k % awayFromLake.length]!;
    const t = 0.25 + rand() * 0.5;
    const to = [{ x: 0, y: Math.floor(H * t) }, { x: Math.floor(W * t), y: 0 }, { x: W - 1, y: Math.floor(H * t) }, { x: Math.floor(W * t), y: H - 1 }][side]!;
    lay(to, () => 6);
  }
  // Then roads to the work sites and the town's own buildings, which must use the gates.
  for (const p of places) if (p !== market) lay({ x: Math.floor(p.x + p.w / 2), y: Math.floor(p.y + p.h / 2) }, (t) => (gates.has(t) ? 0.3 : 400));
  for (let i = 0; i < W * H; i++) if (roads[i]) occupied[i] = 1;

  // Docks: short wooden piers out into the lake from the shore nearest the town.
  const docks = new Set<number>();
  const out = [[-1, 0], [0, -1], [1, 0], [0, 1]][lakeSide]!;
  for (let k = 0; k < 3; k++) {
    let best: { x: number; y: number; d: number } | undefined;
    for (let t = 0; t < 400; t++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * H);
      const i = idx(x, y);
      if (terrain[i] !== 'grass' || occupied[i] || !inside(x + out[0]!, y + out[1]!) || terrain[idx(x + out[0]!, y + out[1]!)] !== 'water' || canal.has(idx(x + out[0]!, y + out[1]!))) continue;
      const d = dist(x, y, cx, cy) + rand() * 3;
      if (!best || d < best.d) best = { x, y, d };
    }
    if (!best) continue;
    for (let s = 1; s <= 4; s++) {
      const x = best.x + out[0]! * s;
      const y = best.y + out[1]! * s;
      if (!inside(x, y) || terrain[idx(x, y)] !== 'water') break;
      docks.add(idx(x, y));
    }
  }

  // Houses, packed irregularly: mixed sizes, some sharing walls, some with an alley between. Each must touch a road,
  // the canal, the market or a neighbour, so the town grows outwards from its streets in clusters. The well-off take
  // the best spots near the market and the canal; the poorest may build outside the wall, near their work.
  const touches = (x: number, y: number, w: number, h: number) => {
    // Within an alley's width (two tiles) of a street, the canal or another building.
    for (let j = y - 2; j <= y + h + 1; j++) for (let i = x - 2; i <= x + w + 1; i++) {
      if (!inside(i, j) || (i >= x && i < x + w && j >= y && j < y + h)) continue;
      const t = idx(i, j);
      if (roads[t] || canal.has(t) || building[t]! >= 0) return true;
    }
    return false;
  };
  const purse = (hId: number) => livingMembers(world, world.households[hId]!).reduce((s, c) => s + c.coins, 0);
  const homes = world.households.filter((h) => livingMembers(world, h).length).sort((a, b) => purse(b.id) - purse(a.id));
  const fieldsAt = fields ? { x: fields.x + 5, y: fields.y + 4 } : { x: mx, y: my };
  const woodsAt = woods ? { x: woods.x + 4, y: woods.y + 3 } : { x: mx, y: my };
  homes.forEach((h, rank) => {
    const members = livingMembers(world, h);
    const wealth = 1 - rank / Math.max(1, homes.length - 1); // 1 for the richest, 0 for the poorest
    const sizes: [number, number][] = wealth > 0.8 ? [[4, 3], [3, 4], [4, 4]] : members.length >= 5 ? [[3, 3], [4, 2], [2, 4]] : [[2, 2], [3, 2], [2, 3]];
    const work = (t: string) => members.filter((m) => m.trade === t).length;
    const pull = work('farmer') > work('laborer') ? fieldsAt : work('laborer') > 0 ? woodsAt : { x: mx, y: my };
    const outsideOk = wealth < 0.25;
    let best: { x: number; y: number; w: number; h: number; s: number } | undefined;
    for (let t = 0; t < 3000; t++) {
      const [w, hh] = sizes[Math.floor(rand() * sizes.length)]!;
      // Search the walled area for those who must live inside it; the whole map for the rest.
      const x = outsideOk ? 1 + Math.floor(rand() * (W - w - 1)) : Math.floor(cx - rx * 1.15 + rand() * rx * 2.3);
      const y = outsideOk ? 1 + Math.floor(rand() * (H - hh - 1)) : Math.floor(cy - ry * 1.15 + rand() * ry * 2.3);
      if (!fits(x, y, w, hh, land, outsideOk ? undefined : true) || !touches(x, y, w, hh)) continue;
      const px = x + w / 2;
      const py = y + hh / 2;
      const s = -dist(px, py, mx, my) * (0.2 + wealth * 0.6) - dist(px, py, pull.x, pull.y) * (0.5 - wealth * 0.4)
        + (canalNear(px, py, 2) ? wealth * 3 : 0) - (inTown(px, py) ? 0 : 2) + rand() * 1.5;
      if (!best || s > best.s) best = { x, y, w, h: hh, s };
    }
    if (!best) {
      // Nowhere by a street: any open ground, inside the wall if there is room.
      const [w, hh] = sizes[0]!;
      const at = pick(w, hh, land, true, (x, y) => -dist(x, y, mx, my), 4000)
        ?? pick(w, hh, ['grass', 'forest'], undefined, (x, y) => -dist(x, y, mx, my), 6000) ?? { x: 1, y: 1 };
      best = { x: at.x, y: at.y, w, h: hh, s: 0 };
    }
    const label = wealth > 0.8 ? `${h.family} townhouse` : best.w * best.h <= 4 ? `${h.family} cottage` : `${h.family} house`;
    const p: Place = { key: `home:${h.id}`, label, sprite: wealth > 0.8 ? 'townhouse' : 'house', x: best.x, y: best.y, w: best.w, h: best.h };
    // Half the houses share a wall with the next; the rest keep an alley.
    claim(p, rand() < 0.5 ? 0 : 1);
    for (let j = p.y; j < p.y + p.h; j++) for (let i = p.x; i < p.x + p.w; i++) building[idx(i, j)] = places.length - 1;
  });

  const tiles = (set: Set<number> | Uint8Array) => (set instanceof Set ? [...set] : [...set].flatMap((r, i) => (r ? [i] : [])));
  const roadList = tiles(roads);
  return {
    width: W,
    height: H,
    terrain,
    roads: roadList,
    boardwalks: roadList.filter((t) => inTown(t % W, Math.floor(t / W))),
    walls: tiles(wall),
    gates: tiles(gates),
    docks: tiles(docks),
    river: true,
    places,
  };
}

/** Cheapest path between two tiles (A* on the grid, four directions). Returns tile indexes. */
function path(from: { x: number; y: number }, to: { x: number; y: number }, cost: (x: number, y: number) => number): number[] {
  const start = idx(from.x, from.y);
  const goal = idx(to.x, to.y);
  const g = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const open = new Set<number>([start]);
  g[start] = 0;
  const h = (i: number) => Math.abs((i % W) - to.x) + Math.abs(Math.floor(i / W) - to.y);
  while (open.size) {
    let cur = -1;
    let best = Infinity;
    for (const i of open) if (g[i]! + h(i) < best) { best = g[i]! + h(i); cur = i; }
    open.delete(cur);
    if (cur === goal) break;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inside(nx, ny)) continue;
      const n = idx(nx, ny);
      const ng = g[cur]! + cost(nx, ny);
      if (ng < g[n]!) { g[n] = ng; prev[n] = cur; open.add(n); }
    }
  }
  const out: number[] = [];
  for (let i = goal; i !== -1; i = prev[i]!) out.push(i);
  return out;
}
