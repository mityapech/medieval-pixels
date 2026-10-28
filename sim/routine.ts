// Daily life: what each person visibly does today, step by step, and the merchants' public adverts.
// Plans are built from what really happened in the day (what was made, imported, sold) and from data/routines.json.
// Nothing here changes the world, and choices use a hash of the day and person, never the world's random stream.
import routinesJson from '../data/routines.json';
import type { GameData } from './data';
import { householdOf } from './family';
import { stockOf } from './inventory';
import { askPrice } from './market';
import { specialityOf } from './specialities';
import type { Advert, Citizen, World } from './types';

/** One visible step of someone's day. where: work, home, market, townhall, church, granary, docks, gate, wall, canal, play, employer, lake, site. */
export interface Task {
  task: string;
  where: string;
}

const R = routinesJson as unknown as {
  recipeSteps: Record<string, Task[]>;
  idleWork: Record<string, Task[]>;
  merchant: Record<'open' | 'visit' | 'import' | 'export' | 'sell', Task[]>;
  office: Record<string, Task[]>;
  idle: Task[];
  elder: Task[];
  builder: Task[];
  school: Task[];
  sick: { home: Task[]; infirmary: Task[] };
  children: { games: Task[]; chores: Task[] };
  adverts: { imported: string[]; local: string[] };
};

/** A stable pseudo-random number for this person, day and purpose. */
function hash(world: World, c: Citizen, salt: number): number {
  let h = (world.seed * 374761393 + world.day * 668265263 + c.id * 2246822519 + salt * 3266489917) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const choose = <T>(world: World, c: Citizen, salt: number, items: readonly T[]): T => items[Math.floor(hash(world, c, salt) * items.length)]!;

/** Today's steps for this person, in order. Empty for the dead. */
export function dayPlan(world: World, data: GameData, c: Citizen): Task[] {
  if (!c.alive) return [];
  // The sick stay in bed, or are looked after at the infirmary when the town has a healer.
  if (c.sick) return world.citizens.some((h) => h.alive && h.office === 'healer') ? R.sick.infirmary : R.sick.home;
  if (c.age < 4) return [{ task: 'Toddling about at home', where: 'home' }];
  if (c.age < data.town.workingAge.adult) {
    // Children play, with a chore now and then; older children are sent on more errands. School-age children
    // have lessons first, when there is a teacher.
    const games = [choose(world, c, 1, R.children.games), choose(world, c, 2, R.children.games), choose(world, c, 3, R.children.games)];
    if (c.age >= 7 && hash(world, c, 4) < 0.5) games.splice(1, 0, choose(world, c, 5, R.children.chores));
    const [from, to] = data.town.authority.schoolAges;
    const teacher = world.citizens.some((t) => t.alive && t.office === 'teacher');
    return teacher && c.age >= from && c.age <= to ? [...R.school, ...games.slice(0, 2)] : games;
  }
  if (c.office) return R.office[c.office] ?? [];
  if (c.trade === 'merchant') {
    const plan = [...R.merchant.open];
    if (c.today.visited) plan.push(choose(world, c, 1, R.merchant.visit));
    if (c.today.imported && Object.keys(c.today.imported).length) plan.push(choose(world, c, 2, R.merchant.import));
    if (c.today.exported && Object.keys(c.today.exported).length) plan.push(...R.merchant.export);
    return [...plan, ...R.merchant.sell];
  }
  if (c.trade === 'builder') return c.today.job ? R.builder : R.idleWork.builder ?? [];
  if (c.trade) {
    // Every run of a recipe today, each with its steps; a day with nothing to make has its own small jobs.
    const plan = (c.workLog ?? []).flatMap((run) => R.recipeSteps[run.recipe] ?? []);
    return plan.length ? plan : R.idleWork[c.trade] ?? [];
  }
  if (c.age >= data.town.workingAge.elder) return [choose(world, c, 1, R.elder), choose(world, c, 2, R.elder)];
  return [choose(world, c, 1, R.idle), choose(world, c, 2, R.idle)];
}

/** The household a servant works for, for 'employer' steps. */
export function employerOf(world: World, c: Citizen): number | null {
  return c.office === 'servant' ? c.employerHousehold : householdOf(world, c).id;
}

/** Each merchant with stock cries their best-stocked goods in their speciality, with prices and where they came from. */
export function advertise(world: World, data: GameData): Advert[] {
  const out: Advert[] = [];
  for (const m of world.citizens) {
    if (!m.alive || m.trade !== 'merchant') continue;
    const speciality = specialityOf(world, m);
    const goods = Object.keys(m.prices)
      .map((good) => {
        const qty = stockOf(m, good);
        const origin = m.inventory.map((l) => (l.good === good ? world.batches.get(l.batch)?.origin : undefined)).find(Boolean);
        return { good, qty, price: askPrice(m, good), origin };
      })
      .filter((g) => g.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 2);
    if (!goods.length) continue;
    const top = goods[0]!;
    const lines = top.origin ? R.adverts.imported : R.adverts.local;
    const text = choose(world, m, 7, lines)
      .replace('{good}', data.goods.get(top.good)!.name)
      .replace('{origin}', top.origin ?? '')
      .replace('{price}', String(top.price))
      .replace('{qty}', String(top.qty));
    out.push({ merchant: m.id, name: m.name, speciality, text: text.charAt(0).toUpperCase() + text.slice(1), goods });
  }
  return out;
}

/** How many visible steps a recipe's work takes. */
export function routineLength(recipe: string): number {
  return R.recipeSteps[recipe]?.length ?? 0;
}
