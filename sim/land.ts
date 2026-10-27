// The land: terrain, roads and where every building stands, generated from the seed so each town is different.
// Generation has its own random stream, so the same seed always gives the same economy whatever the map looks like.
import type { GameData } from './data';
import { livingMembers } from './family';
import type { Land, Place, Terrain, World } from './types';

const W = 48;
const H = 34;

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
  const terrain = new Array<Terrain>(W * H).fill('grass');

  // A river crosses the map most of the time, wandering downhill from one edge to the opposite one.
  const river = rand() < 0.85;
  if (river) {
    const vertical = rand() < 0.5;
    let x = vertical ? Math.floor(W * (0.2 + 0.6 * rand())) : 0;
    let y = vertical ? 0 : Math.floor(H * (0.2 + 0.6 * rand()));
    let drift = 0;
    const width = rand() < 0.4 ? 2 : 1;
    while (inside(x, y)) {
      for (let k = 0; k < width; k++) {
        const wx = vertical ? x + k : x;
        const wy = vertical ? y : y + k;
        if (inside(wx, wy)) terrain[idx(wx, wy)] = 'water';
      }
      // Bend towards lower ground, with some wandering, but keep heading across the map.
      drift = Math.max(-1, Math.min(1, drift * 0.6 + (rand() - 0.5) * 1.2));
      const side = (dx: number, dy: number) => (inside(x + dx, y + dy) ? height[idx(x + dx, y + dy)]! : 1);
      const lean = vertical ? side(-1, 1) - side(1, 1) : side(1, -1) - side(1, 1);
      const step = Math.sign(Math.round(drift + lean * 3));
      // Move sideways first (painting that tile too) so the river stays one connected stream.
      if (vertical) {
        const nx = Math.max(1, Math.min(W - 3, x + step));
        if (nx !== x) for (let k = 0; k < width; k++) if (inside(nx + k, y)) terrain[idx(nx + k, y)] = 'water';
        x = nx;
        y += 1;
      } else {
        const ny = Math.max(1, Math.min(H - 3, y + step));
        if (ny !== y) for (let k = 0; k < width; k++) if (inside(x, ny + k)) terrain[idx(x, ny + k)] = 'water';
        y = ny;
        x += 1;
      }
    }
  }
  const nearWater = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inside(x + dx, y + dy) && terrain[idx(x + dx, y + dy)] === 'water') return true;
    return false;
  };

  // Woods grow on one side of the town, rock outcrops on high ground, everything else is grass.
  const woodsSide = rand() * Math.PI * 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (terrain[i] === 'water') continue;
      const dx = x / W - 0.5;
      const dy = y / H - 0.5;
      const towardsWoods = (dx * Math.cos(woodsSide) + dy * Math.sin(woodsSide)) * 2; // -1..1 across the map
      if (height[i]! > 0.68) terrain[i] = 'rock';
      else if (wet[i]! * 0.6 + towardsWoods * 0.55 > 0.55) terrain[i] = 'forest';
    }
  }

  const occupied = new Uint8Array(W * H);
  const places: Place[] = [];
  const fits = (x: number, y: number, w: number, h: number, allow: Terrain[]) => {
    if (x < 1 || y < 1 || x + w > W - 1 || y + h > H - 1) return false;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) if (occupied[idx(i, j)] || !allow.includes(terrain[idx(i, j)]!)) return false;
    }
    return true;
  };
  const claim = (p: Place, margin = 1) => {
    places.push(p);
    for (let j = p.y - margin; j < p.y + p.h + margin; j++) {
      for (let i = p.x - margin; i < p.x + p.w + margin; i++) if (inside(i, j)) occupied[idx(i, j)] = 1;
    }
  };
  /** The best-scoring free rectangle of the given size among many random tries. */
  const pick = (w: number, h: number, allow: Terrain[], score: (x: number, y: number) => number, tries = 600) => {
    let best: { x: number; y: number; s: number } | undefined;
    for (let t = 0; t < tries; t++) {
      const x = 1 + Math.floor(rand() * (W - w - 1));
      const y = 1 + Math.floor(rand() * (H - h - 1));
      if (!fits(x, y, w, h, allow)) continue;
      const s = score(x + w / 2, y + h / 2) + rand() * 0.5;
      if (!best || s > best.s) best = { x, y, s };
    }
    return best;
  };
  /** Like pick, but if no open ground fits, the site goes on woodland or rock, which is cleared for it. */
  const pickOrClear = (w: number, h: number, allow: Terrain[], score: (x: number, y: number) => number, tries = 900) => {
    const at = pick(w, h, allow, score, tries) ?? pick(w, h, ['grass', 'forest', 'rock'], score, tries * 4);
    if (at) for (let j = at.y; j < at.y + h; j++) for (let i = at.x; i < at.x + w; i++) terrain[idx(i, j)] = 'grass';
    return at;
  };
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
  const land: Terrain[] = ['grass'];

  // The market square: near the middle, on open ground, close to the river if there is one.
  const mk = pickOrClear(8, 5, land, (x, y) => -dist(x, y, W / 2, H / 2) * 0.5 + (nearWater(Math.floor(x), Math.floor(y), 6) ? 4 : 0))
    ?? { x: W / 2 - 4, y: H / 2 - 2 };
  const market: Place = { key: 'market', label: 'Market square', sprite: 'market', x: mk.x, y: mk.y, w: 8, h: 5 };
  claim(market);
  const mx = market.x + market.w / 2;
  const my = market.y + market.h / 2;

  // Work sites on the land that suits them: woods where the forest is, fields on wet flat ground near water.
  const forestShare = (x: number, y: number, r: number, kind: Terrain) => {
    let n = 0, all = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!inside(Math.floor(x) + dx, Math.floor(y) + dy)) continue;
      all++;
      if (terrain[idx(Math.floor(x) + dx, Math.floor(y) + dy)] === kind) n++;
    }
    return all ? n / all : 0;
  };
  const woods = pick(9, 7, ['forest', 'grass', 'rock'], (x, y) => forestShare(x, y, 5, 'forest') * 10 + forestShare(x, y, 6, 'rock') * 6 - dist(x, y, mx, my) * 0.05);
  if (woods) claim({ key: 'work:laborer', label: 'Woods and quarry', sprite: 'woods', x: woods.x, y: woods.y, w: 9, h: 7 });
  const fields = pickOrClear(11, 8, land, (x, y) => wet[idx(Math.floor(x), Math.floor(y))]! * 4 + (nearWater(Math.floor(x), Math.floor(y), 7) ? 3 : 0) - Math.abs(dist(x, y, mx, my) - 13) * 0.3);
  if (fields) claim({ key: 'work:farmer', label: 'Fields', sprite: 'fields', x: fields.x, y: fields.y, w: 11, h: 8 });

  // Shared buildings: church and granary by the market, merchants' row facing it, bakery on a main street,
  // and the smithy a little way out because of the fire.
  const near = (r: number) => (x: number, y: number) => -Math.abs(dist(x, y, mx, my) - r);
  const shared: [string, string, string, number, number, number][] = [
    ['church', 'Church', 'church', 4, 5, 7],
    ['granary', 'Granary', 'granary', 3, 3, 7],
    ['work:merchant', "Merchants' row", 'merchants', 8, 2, 5],
    ['work:baker', 'Bakery', 'bakery', 3, 3, 8],
    ['work:blacksmith', 'Smithy', 'smithy', 3, 3, 12],
  ];
  for (const [key, label, sprite, w, h, r] of shared) {
    const at = pick(w, h, land, near(r), 900) ?? pickOrClear(w, h, land, near(r), 3000);
    if (at) claim({ key, label, sprite, x: at.x, y: at.y, w, h });
  }

  // Roads: from the market to each work site and out to the neighbouring towns, following easy ground.
  const roads = new Uint8Array(W * H);
  const ends: { x: number; y: number }[] = places.filter((p) => p !== market).map((p) => ({ x: Math.floor(p.x + p.w / 2), y: Math.floor(p.y + p.h / 2) }));
  const edgeCount = Math.min(data.town.neighbours.names.length, 3);
  const edgeAngle = rand() * Math.PI * 2;
  for (let k = 0; k < edgeCount; k++) {
    const a = edgeAngle + (k * Math.PI * 2) / edgeCount + (rand() - 0.5) * 0.6;
    let x = mx, y = my;
    while (inside(Math.round(x + Math.cos(a)), Math.round(y + Math.sin(a)))) { x += Math.cos(a); y += Math.sin(a); }
    ends.push({ x: Math.round(x), y: Math.round(y) });
  }
  const roadNoise = noiseField(rand, [5]);
  const building = new Int16Array(W * H).fill(-1);
  places.forEach((p, n) => { for (let j = p.y; j < p.y + p.h; j++) for (let i = p.x; i < p.x + p.w; i++) building[idx(i, j)] = n; });
  for (const e of ends) {
    const goalPlace = building[idx(e.x, e.y)];
    for (const t of path({ x: Math.floor(mx), y: Math.floor(my) }, e, (x, y) => {
      const b = building[idx(x, y)]!;
      if (b >= 0 && places[b] !== market && b !== goalPlace) return 40; // go round buildings, not through them
      const ter = terrain[idx(x, y)];
      const base = roads[idx(x, y)] ? 0.3 : ter === 'water' ? 12 : ter === 'rock' ? 4 : ter === 'forest' ? 2.5 : 1;
      return base + roadNoise[idx(x, y)]! * 1.5;
    })) if (building[t]! < 0) roads[t] = 1;
  }
  // Houses must not sit on roads.
  for (let i = 0; i < W * H; i++) if (roads[i]) occupied[i] = 1;

  // Houses line the roads. Richer households take the plots nearest the market; farmers prefer the fields
  // side, laborers the woods side.
  const alongRoad = (x: number, y: number, w: number, h: number) => {
    for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) if (inside(i, j) && roads[idx(i, j)]) return true;
    return false;
  };
  const purse = (hId: number) => livingMembers(world, world.households[hId]!).reduce((s, c) => s + c.coins, 0);
  const homes = world.households.filter((h) => livingMembers(world, h).length).sort((a, b) => purse(b.id) - purse(a.id));
  const fieldsAt = fields ? { x: fields.x + 5, y: fields.y + 4 } : { x: mx, y: my };
  const woodsAt = woods ? { x: woods.x + 4, y: woods.y + 3 } : { x: mx, y: my };
  homes.forEach((h, rank) => {
    const members = livingMembers(world, h);
    const work = (t: string) => members.filter((m) => m.trade === t).length;
    const size: [number, number] = rank < 3 ? [4, 3] : members.length >= 5 ? [3, 3] : rand() < 0.5 ? [3, 2] : [2, 3];
    const pull = work('farmer') > work('laborer') ? fieldsAt : work('laborer') > 0 ? woodsAt : { x: mx, y: my };
    const wealth = 1 - rank / Math.max(1, homes.length - 1); // 1 for the richest, 0 for the poorest
    const score = (x: number, y: number) => -dist(x, y, mx, my) * (0.15 + wealth * 0.5) - dist(x, y, pull.x, pull.y) * (0.6 - wealth * 0.4);
    let best: { x: number; y: number; s: number } | undefined;
    for (let t = 0; t < 2500; t++) {
      const x = 1 + Math.floor(rand() * (W - size[0] - 1));
      const y = 1 + Math.floor(rand() * (H - size[1] - 1));
      if (!fits(x, y, size[0], size[1], land) || !alongRoad(x, y, size[0], size[1])) continue;
      const s = score(x + size[0] / 2, y + size[1] / 2) + rand() * 0.8;
      if (!best || s > best.s) best = { x, y, s };
    }
    // A crowded map: settle for any open ground.
    best ??= pick(size[0], size[1], ['grass', 'forest'], (x, y) => -dist(x, y, mx, my), 5000);
    const at = best ?? { x: 1, y: 1 };
    const label = rank < 3 ? `${h.family} townhouse` : members.length <= 2 ? `${h.family} cottage` : `${h.family} house`;
    claim({ key: `home:${h.id}`, label, sprite: rank < 3 ? 'townhouse' : 'house', x: at.x, y: at.y, w: size[0], h: size[1] }, 1);
  });

  return { width: W, height: H, terrain, roads: [...roads].flatMap((r, i) => (r ? [i] : [])), river, places };
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
