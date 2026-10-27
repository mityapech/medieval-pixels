// Daily life in the town view: who goes where and when, walking along the streets.
// Each destination has a walking-distance map over the town (streets are quick, open ground slower, buildings and
// the wall slow, water only by bridges and docks), so people follow the roads, cross by bridges and use the gates.
// Schedules come from the simulation's day plans (sim/routine.ts): each step of a job is done in turn, at its place.
import { dayPlan, type Citizen, type Place, type Task, type World } from '../../sim/index';
import type { GameData } from '../../sim/data';
import { TILE } from './layout';

/** Someone on the map: who they are, where they stand, and the destination they have settled at (if any). */
export interface Mover {
  c: Citizen;
  x: number;
  y: number;
  settledAt?: string;
}

/** Where someone is heading: a destination (see Activity.dest), the point in it, how they behave there, and why. */
export interface Target {
  dest: string;
  x: number;
  y: number;
  mode: 'still' | 'play';
  task?: string;
}

/** Walking pace: about one and a half tiles a second at 1x. */
export const WALK_PX_PER_MS = (1.5 * TILE) / 1000;

export interface Activity {
  task: string;
  /** A place key (home:3, work:farmer, market, church, granary) or an area (docks, gate, wall, canal, play). */
  dest: string;
  /** The exact point to stand at once there. */
  x: number;
  y: number;
  /** How the person moves once there: still (small fidgets) or play (running about). */
  mode: 'still' | 'play';
}

/** A stable pseudo-random number for a person and purpose. */
export function hash(a: number, b: number, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Life {
  private readonly W: number;
  private readonly H: number;
  private readonly cost: Float32Array;
  private readonly fields = new Map<string, Float32Array>();
  private readonly areas = new Map<string, number[]>();
  private plans = new Map<number, Task[]>();

  constructor(private readonly world: World, private readonly data: GameData, private readonly places: Map<string, Place>) {
    const { width: W, height: H, terrain, roads, walls, gates, docks } = world.land;
    this.W = W;
    this.H = H;
    const cost = new Float32Array(W * H);
    terrain.forEach((t, i) => { cost[i] = t === 'water' ? Infinity : t === 'forest' ? 3 : t === 'rock' ? 4 : 2; });
    for (const p of places.values()) {
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) cost[y * W + x] = p.key.startsWith('home:') ? 6 : 3;
    }
    for (const t of walls) cost[t] = 60; // only guards walking the wall go up there
    for (const t of roads) cost[t] = 1; // including bridges over the canal
    for (const t of gates) cost[t] = 1;
    for (const t of docks) cost[t] = 1.5;
    this.cost = cost;

    // Areas made of many tiles: the docks, the gates, the wall, the canal banks, and open ground for play.
    const market = places.get('market')!;
    const mx = market.x + market.w / 2;
    const my = market.y + market.h / 2;
    const inPlace = new Uint8Array(W * H);
    for (const p of places.values()) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) inPlace[y * W + x] = 1;
    const walkable = (i: number) => Number.isFinite(cost[i]!) && cost[i]! < 60;
    const bank: number[] = [];
    const play: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (!walkable(i) || inPlace[i]) continue;
      const x = i % W;
      const y = Math.floor(i / W);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => terrain[(y + dy!) * W + x + dx!] === 'water' && !docks.includes((y + dy!) * W + x + dx!))) bank.push(i);
      if (terrain[i] === 'grass' && !roads.includes(i) && Math.hypot(x - mx, y - my) < 11) play.push(i);
    }
    this.areas.set('docks', docks.length ? docks : bank);
    this.areas.set('gate', gates.length ? gates : [market.y * W + market.x]);
    this.areas.set('wall', walls);
    this.areas.set('canal', bank.filter((i) => Math.hypot((i % W) - mx, Math.floor(i / W) - my) < 14).concat(bank).slice(0, 400));
    this.areas.set('play', play.length ? play : bank);
  }

  /** Called each new day: everyone's plan for the day. */
  newDay(): void {
    this.plans = new Map(this.world.citizens.filter((c) => c.alive).map((c) => [c.id, dayPlan(this.world, this.data, c)]));
  }

  planOf(c: Citizen): Task[] {
    return this.plans.get(c.id) ?? [];
  }

  /** What someone is doing at time t of the day (0..1), or undefined when they are simply at home. */
  activity(c: Citizen, t: number): (Activity & Target) | undefined {
    const plan = this.planOf(c);
    if (!plan.length) return undefined;
    const child = c.age < this.data.town.workingAge.adult;
    const elder = c.age >= this.data.town.workingAge.elder;
    // People set off at their own time in the morning; merchants, guards and priests work through market hours.
    const start = 0.29 + hash(c.id, this.world.day, 1) * 0.04 + (child ? 0.02 : 0) + (elder ? 0.05 : 0);
    const end = child ? 0.72 : c.office || c.trade === 'merchant' ? 0.75 : !c.trade ? 0.7 : 0.55;
    if (t < start || t >= end) return undefined;
    const step = Math.min(plan.length - 1, Math.floor(((t - start) / (end - start)) * plan.length));
    const task = plan[step]!;
    const area = this.destOf(c, task);
    const at = this.spot(area, c.id, step);
    // A scattered area (canal bank, docks, wall...) is headed for at the exact tile of the spot, so nobody arrives
    // on one bank and then tries to walk straight across the water to the other.
    const dest = this.places.has(area) ? area : `tile:${Math.floor(at.y / TILE) * this.W + Math.floor(at.x / TILE)}`;
    // Only running games are played on the run; watching the guards or skipping stones is done standing.
    const mode = child && /^(Playing|Chasing|Racing)/.test(task.task) ? 'play' : 'still';
    return { task: task.task, dest, x: at.x, y: at.y, mode };
  }

  private destOf(c: Citizen, task: Task): string {
    const home = `home:${c.householdId}`;
    switch (task.where) {
      case 'work': return c.trade ? `work:${c.trade}` : home;
      case 'home': return home;
      case 'employer': return c.employerHousehold !== null ? `home:${c.employerHousehold}` : home;
      case 'market': case 'church': case 'granary': return task.where;
      default: return this.areas.get(task.where)?.length ? task.where : 'market';
    }
  }

  /** A point inside a place or area for this person and step, so a worker moves about the fields from task to task. */
  spot(dest: string, id: number, salt: number): { x: number; y: number } {
    const place = this.places.get(dest);
    if (place) {
      const u = hash(id, salt, 7);
      const v = hash(id, salt, 11);
      return { x: (place.x + 0.4 + u * (place.w - 0.8)) * TILE, y: (place.y + 0.4 + v * (place.h - 0.8)) * TILE };
    }
    const tiles = this.areas.get(dest) ?? [];
    const i = tiles[Math.floor(hash(id, salt, 13) * tiles.length)] ?? 0;
    return { x: ((i % this.W) + 0.3 + hash(id, salt, 17) * 0.4) * TILE, y: (Math.floor(i / this.W) + 0.3 + hash(id, salt, 19) * 0.4) * TILE };
  }

  private passable(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return false;
    return this.cost[ty * this.W + tx]! < 60;
  }

  /** Walking cost from a point to a destination (0 inside it). */
  pathCost(dest: string, x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return Infinity;
    return this.field(dest)[ty * this.W + tx] ?? Infinity;
  }

  /** Whether a point is inside the destination (its place or one of its area tiles). */
  private arrived(dest: string, x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const place = this.places.get(dest);
    if (place) return tx >= place.x && tx < place.x + place.w && ty >= place.y && ty < place.y + place.h;
    return (this.field(dest)[ty * this.W + tx] ?? Infinity) === 0;
  }

  /** Walking distance to a destination from every tile (Dijkstra), computed once per destination. */
  private field(dest: string): Float32Array {
    let f = this.fields.get(dest);
    if (f) return f;
    const { W, H } = this;
    f = new Float32Array(W * H).fill(Infinity);
    const place = this.places.get(dest);
    const sources = place
      ? Array.from({ length: place.w * place.h }, (_, k) => (place.y + Math.floor(k / place.w)) * W + place.x + (k % place.w))
      : dest.startsWith('tile:') ? [Number(dest.slice(5))] : this.areas.get(dest) ?? [];
    const heap = new MinHeap();
    for (const s of sources) { f[s] = 0; heap.push(s, 0); }
    while (heap.size) {
      const [i, d] = heap.pop();
      if (d > f[i]!) continue;
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        const nd = d + this.cost[n]!;
        if (nd < f[n]!) { f[n] = nd; heap.push(n, nd); }
      }
    }
    this.fields.set(dest, f);
    return f;
  }

  /**
   * One frame of movement for everyone. People walk along the streets at a walking pace (children run, elders take
   * their time); once settled at their destination they potter about their task, and children playing running
   * games run around. The spots people head for are spread apart so nobody stands inside anybody else (spreading
   * the spots, not the people, so walking and spreading never fight).
   */
  move(people: { m: Mover; to: Target }[], now: number, dt: number, speed: number): void {
    const moving = people.map(({ m, to }) => {
      let gx = to.x;
      let gy = to.y;
      const phaseOffset = hash(m.c.id, 3) * Math.PI * 2;
      if (to.mode === 'play') {
        const r = TILE * (0.4 + hash(m.c.id, 5) * 0.5); // small loops, so play stays around their spot
        gx += Math.cos(now / 900 + phaseOffset) * r;
        gy += Math.sin(now / 700 + phaseOffset) * r * 0.7;
      } else {
        gx += Math.sin(now / 2600 + phaseOffset) * 3;
        gy += Math.cos(now / 3100 + phaseOffset) * 3;
      }
      // Settled once inside the destination; they stay settled until clearly further away (or heading somewhere
      // new), so nobody flips between walking straight and following the street.
      const cost = this.pathCost(to.dest, m.x, m.y);
      if (m.settledAt !== to.dest || cost > 14) m.settledAt = cost === 0 ? to.dest : undefined;
      return { m, to, gx, gy, near: m.settledAt === to.dest };
    });

    const ROOM = 13;
    const settled = moving.filter((v) => v.near);
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < settled.length; i++) {
        for (let j = i + 1; j < settled.length; j++) {
          const a = settled[i]!;
          const b = settled[j]!;
          const dx = b.gx - a.gx;
          const dy = b.gy - a.gy;
          const d = Math.hypot(dx, dy);
          if (d >= ROOM) continue;
          const push = (ROOM - d) / 2;
          const angle = hash(a.m.c.id, b.m.c.id) * Math.PI * 2;
          const ux = d > 0.01 ? dx / d : Math.cos(angle);
          const uy = d > 0.01 ? dy / d : Math.sin(angle);
          a.gx -= ux * push; a.gy -= uy * push;
          b.gx += ux * push; b.gy += uy * push;
        }
      }
    }

    for (const { m, to, gx, gy, near } of moving) {
      const pace = m.c.age < this.data.town.workingAge.adult ? 1.5 : m.c.age >= this.data.town.workingAge.elder ? 0.7 : 1;
      const walk = WALK_PX_PER_MS * pace * dt * Math.max(1, Math.min(speed, 12));
      if (near) {
        const dx = gx - m.x;
        const dy = gy - m.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.5) {
          const step = Math.min(d, walk);
          const nx = m.x + (dx / d) * step;
          const ny = m.y + (dy / d) * step;
          // Pottering about never takes anyone into the water or up onto the wall.
          if (this.passable(nx, ny) || !this.passable(m.x, m.y)) { m.x = nx; m.y = ny; }
        }
      } else {
        const at = this.walk(m, to.dest, { x: gx, y: gy }, walk);
        m.x = at.x;
        m.y = at.y;
      }
    }
  }

  /**
   * Moves a walker up to `dist` pixels towards (x, y) inside `dest`: along the cheapest route until they are there,
   * then straight to the spot. Returns the new position.
   */
  walk(from: { x: number; y: number }, dest: string, to: { x: number; y: number }, dist: number): { x: number; y: number } {
    let { x, y } = from;
    const f = this.field(dest);
    for (let guard = 0; dist > 0.01 && guard < 12; guard++) {
      let gx = to.x;
      let gy = to.y;
      if (!this.arrived(dest, x, y)) {
        // Head for the centre of the neighbouring tile that is closest to the destination.
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        let best = f[ty * this.W + tx] ?? Infinity;
        let next: [number, number] | undefined;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = (ty + dy) * this.W + tx + dx;
          if (tx + dx < 0 || ty + dy < 0 || tx + dx >= this.W || ty + dy >= this.H) continue;
          if (f[n]! < best) { best = f[n]!; next = [tx + dx, ty + dy]; }
        }
        if (next) { gx = (next[0] + 0.5) * TILE; gy = (next[1] + 0.5) * TILE; }
      }
      const dx = gx - x;
      const dy = gy - y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01) break;
      const s = Math.min(d, dist, TILE / 2);
      x += (dx / d) * s;
      y += (dy / d) * s;
      dist -= s;
    }
    return { x, y };
  }
}

/** A small binary heap of (tile, distance), smallest distance first. */
class MinHeap {
  private items: [number, number][] = [];
  get size(): number { return this.items.length; }
  push(i: number, d: number): void {
    const a = this.items;
    a.push([i, d]);
    for (let k = a.length - 1; k > 0;) {
      const p = (k - 1) >> 1;
      if (a[p]![1] <= a[k]![1]) break;
      [a[p], a[k]] = [a[k]!, a[p]!];
      k = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let k = 0; ;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && a[l]![1] < a[m]![1]) m = l;
        if (r < a.length && a[r]![1] < a[m]![1]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k]!, a[m]!];
        k = m;
      }
    }
    return top;
  }
}
