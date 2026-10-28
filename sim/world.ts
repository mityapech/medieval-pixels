// Builds the starting town: about 60 people in households of mixed shapes, with kin spread across them.
import { foodTarget, talent } from './agent';
import { totalCoins } from './coins';
import { HEAVENS_PURSE } from './god';
import { initialBuildings } from './construction';
import { initialProperty } from './property';
import { findHousePlot, generateLand } from './land';
import type { GameData } from './data';
import { isWorkingAge } from './family';
import { addLot, makeBatch } from './inventory';
import { pick, random, randomInt, shuffle } from './rng';
import type { BatchId, Citizen, GoodId, Holder, Household, Trade, World } from './types';
import { TRADES } from './types';


export function createWorld(data: GameData, seed = 1): World {
  const world: World = {
    day: 0,
    seed,
    rngState: seed,
    citizens: [],
    households: [],
    land: { width: 0, height: 0, terrain: [], roads: [], boardwalks: [], walls: [], gates: [], docks: [], river: false, places: [] },
    buildings: {},
    property: {},
    elections: [],
    decrees: [],
    foundingPopulation: 0,
    projects: [],
    waiting: [],
    batches: new Map(),
    nextBatchId: 1,
    ledger: [],
    initialCoins: 0,
    reports: [],
    treasury: { key: 'treasury', name: 'Town treasury', coins: data.town.authority.startTreasury },
    heavens: { key: 'heavens', name: 'The heavens', coins: HEAVENS_PURSE },
    church: { key: 'church', name: 'Church', coins: data.town.authority.startChurch },
    granary: { name: 'Town granary', inventory: [] },
    neighbours: [],
    events: [],
    unmet: {},
    conversations: [],
    talkRngState: seed ^ 0x5eed7a1c,
    meetings: [],
    taxHistory: [],
  };
  const { town } = data;
  for (const name of town.neighbours.names) {
    const [lo, hi] = town.neighbours.priceSpread;
    const prices: Record<string, number> = {};
    for (const g of data.goods.values()) prices[g.id] = g.basePrice * (lo + (hi - lo) * random(world));
    world.neighbours.push({ key: `town:${name}`, name, coins: town.neighbours.startCoins, prices });
  }
  generateFamilies(world, data);

  // Who works at the start: every working-age head, other adults by chance.
  const workers: Citizen[] = [];
  for (const h of world.households) {
    for (const id of h.memberIds) {
      const c = world.citizens[id]!;
      if (!isWorkingAge(data, c)) continue;
      if (id === h.headId || random(world) < town.secondEarnerChance) workers.push(c);
    }
  }
  // Share trades out by the configured proportions (largest remainder), in random order.
  shuffle(world, workers);
  const quotas = TRADES.map((t) => ({ t, exact: workers.length * town.trades[t].share }));
  const counts = new Map<Trade, number>(quotas.map((q) => [q.t, Math.floor(q.exact)]));
  let left = workers.length - [...counts.values()].reduce((a, b) => a + b, 0);
  for (const q of [...quotas].sort((a, b) => (b.exact % 1) - (a.exact % 1))) if (left-- > 0) counts.set(q.t, counts.get(q.t)! + 1);
  // People with a gift for a trade take it up first; the rest are shared out, keeping people from trades they are poor at.
  let pool = [...workers];
  const slots = new Map(counts);
  for (const t of shuffle(world, [...TRADES])) {
    for (const c of pool.filter((x) => talent(data, x, t) > 1)) {
      if (!slots.get(t)) break;
      c.trade = t;
      slots.set(t, slots.get(t)! - 1);
    }
    pool = pool.filter((x) => !x.trade);
  }
  for (const t of TRADES) {
    for (let i = 0; i < slots.get(t)!; i++) {
      const best = pool.reduce((a, b) => (talent(data, b, t) > talent(data, a, t) ? b : a));
      best.trade = t;
      pool = pool.filter((x) => x !== best);
    }
  }

  for (const c of world.citizens) {
    const ageGroup = c.age < town.workingAge.adult ? 'child' : c.age >= town.workingAge.elder ? 'elder' : 'adult';
    c.coins = town.startCoins[ageGroup] + (c.trade ? town.trades[c.trade].startCoins : 0);
  }
  world.initialCoins = totalCoins(world);

  // Starting goods. Each comes from a real founding maker, so it is traceable like anything made later.
  for (const h of world.households) {
    const head = world.citizens[h.headId]!;
    const food = Math.ceil(foodTarget(world, data, head) * (town.startFoodDays / town.foodStockDays));
    seedGood(world, data, head, pick(world, ['bread', 'bread', 'pie', 'tart']), food);
    for (const need of town.householdNeeds) seedGood(world, data, head, need.good, need.perHouseholdPerDay * need.stockDays);
  }
  for (const c of workers) {
    for (const r of data.recipesByTrade[c.trade!]) {
      for (const g of Object.keys(r.outputs)) c.prices[g] = data.goods.get(g)!.basePrice;
    }
    const tools = new Set(data.recipesByTrade[c.trade!].flatMap((r) => (r.tool ? [r.tool] : [])));
    for (const tool of tools) seedGood(world, data, c, tool, 1);
    // A few days of inputs for each recipe, and farmers and other gatherers start with one batch to sell.
    const recipes = data.recipesByTrade[c.trade!];
    const runs = town.trades[c.trade!].batchesPerDay * town.startInputDays;
    recipes.forEach((r, i) => {
      const share = Math.ceil(runs / recipes.length) + (i === 0 ? 1 : 0);
      for (const [g, q] of Object.entries(r.inputs)) seedGood(world, data, c, g, q * share);
      if (!Object.keys(r.inputs).length && i === 0) for (const [g, q] of Object.entries(r.outputs)) seedGood(world, data, c, g, q);
    });
  }
  // The public granary starts with some stores laid by in earlier years.
  for (const good of town.granary.goods) seedGood(world, data, world.granary, good, Math.round(town.granary.targetUnits * town.granary.startShare));
  // Where everyone lives and works. Uses its own random stream, so it never changes the economy.
  world.land = generateLand(world, data);
  world.buildings = initialBuildings(world);
  world.property = initialProperty(world, data);
  world.foundingPopulation = world.citizens.length;
  return world;
}

const between = (world: World, lo: number, hi: number) => lo + randomInt(world, hi - lo + 1);

/** Creates households until the town reaches its population, then links some of them as kin. */
function generateFamilies(world: World, data: GameData): void {
  const { town } = data;
  const kinds = Object.entries(town.householdKinds);
  const totalWeight = kinds.reduce((s, [, w]) => s + w, 0);
  const families = shuffle(world, [...data.familyNames]);
  const usedNames = new Set<string>();

  while (world.citizens.length < town.population) {
    let roll = random(world) * totalWeight;
    let kind = kinds[0]![0];
    for (const [k, w] of kinds) if ((roll -= w) < 0) { kind = k; break; }
    const room = town.population - world.citizens.length;
    const family = families.pop() ?? pick(world, data.familyNames);
    const h: Household = { id: world.households.length, family, kind, headId: -1, memberIds: [] };
    world.households.push(h);

    const person = (age: number, parents: Citizen[] = [], surname = family): Citizen => {
      const c = newCitizen(world, data, h, age, parents, surname, usedNames);
      if (h.headId < 0) h.headId = c.id;
      return c;
    };
    const marry = (a: Citizen, b: Citizen) => { a.spouseId = b.id; b.spouseId = a.id; };
    // A spouse keeps the name of the family they were born into half the time.
    const spouseName = () => (random(world) < 0.5 ? family : pick(world, data.familyNames));
    const children = (parents: Citizen[], max: number) => {
      const youngest = Math.min(...parents.map((p) => p.age));
      const n = Math.min(between(world, 1, max), room - h.memberIds.length);
      for (let i = 0; i < n; i++) person(between(world, 0, Math.min(15, youngest - 18)), parents);
    };

    // Bigger household shapes need room for their core members; otherwise fall back to a smaller shape.
    if ((kind === 'three_generations' || kind === 'extended') && room < 3) kind = 'couple';
    if (kind === 'single' || room < 2) {
      person(between(world, 18, 55));
    } else if (kind === 'couple') {
      const old = random(world) < 0.4;
      const a = person(old ? between(world, 60, 75) : between(world, 20, 55));
      marry(a, person(Math.max(18, a.age + between(world, -5, 5)), [], spouseName()));
    } else if (kind === 'couple_with_children') {
      const a = person(between(world, 24, 45));
      const b = person(Math.max(20, a.age + between(world, -4, 4)), [], spouseName());
      marry(a, b);
      children([a, b], 4);
    } else if (kind === 'single_parent') {
      children([person(between(world, 24, 45))], 3);
    } else if (kind === 'three_generations') {
      // An adult child heads the household; their widowed parent or both parents live with them.
      const head = person(between(world, 28, 42));
      const spouse = person(Math.max(20, head.age + between(world, -4, 4)), [], spouseName());
      marry(head, spouse);
      const elder = person(head.age + between(world, 22, 32));
      head.parentIds.push(elder.id);
      if (random(world) < 0.5 && h.memberIds.length < room) {
        const elder2 = person(elder.age + between(world, -4, 4), [], spouseName());
        marry(elder, elder2);
        head.parentIds.push(elder2.id);
      }
      if (h.memberIds.length < room) children([head, spouse], 3);
    } else if (kind === 'siblings') {
      const eldest = person(between(world, 20, 40));
      const n = Math.min(between(world, 1, 2), room - 1);
      for (let i = 0; i < n; i++) person(Math.max(16, eldest.age - between(world, 1, 6)));
    } else {
      // Extended: parents at the head, a married adult child and grandchildren living with them.
      const a = person(between(world, 48, 62));
      const b = person(Math.max(40, a.age + between(world, -4, 4)), [], spouseName());
      marry(a, b);
      const adultChild = person(between(world, 20, Math.min(30, a.age - 18)), [a, b]);
      if (h.memberIds.length < room) {
        const inLaw = person(Math.max(18, adultChild.age + between(world, -3, 3)), [], spouseName());
        marry(adultChild, inLaw);
        if (h.memberIds.length < room) children([adultChild, inLaw], 2);
      }
    }
  }
  linkKin(world, data);
}

/** Some adults who live apart from their parents are the grown children of elders elsewhere; siblings share them. */
function linkKin(world: World, data: GameData): void {
  const elders = world.citizens.filter((c) => c.age >= 50);
  for (const h of world.households) {
    const head = world.citizens[h.headId]!;
    if (head.parentIds.length || random(world) > 0.45) continue;
    const parent = elders.find((e) => e.householdId !== h.id && e.age - head.age >= 20 && e.age - head.age <= 35 && random(world) < 0.5);
    if (!parent) continue;
    const parents = [parent, ...(parent.spouseId !== null ? [world.citizens[parent.spouseId]!] : [])];
    const sharedSiblings = h.kind === 'siblings' ? h.memberIds.map((id) => world.citizens[id]!) : [head];
    for (const s of sharedSiblings) if (!s.parentIds.length) s.parentIds = parents.map((p) => p.id);
  }
  void data;
}

/** Adds a new citizen to a household (at the town's founding, or a birth). Names are unique within the town. */
export function newCitizen(
  world: World, data: GameData, h: Household, age: number, parents: Citizen[], surname: string,
  usedNames = new Set(world.citizens.map((c) => c.name)),
): Citizen {
  let name = '';
  for (let tries = 0; ; tries++) {
    name = `${pick(world, data.firstNames)} ${surname}`;
    if (!usedNames.has(name)) break;
    if (tries > 40) { name = `${name} ${['the Younger', 'the Second', 'Junior'][tries % 3]}`; if (!usedNames.has(name)) break; }
  }
  usedNames.add(name);
  const c: Citizen = {
    id: world.citizens.length, key: `citizen:${world.citizens.length}`, name, age, office: null, employerHousehold: null,
    traits: rollTraits(world, data), trade: null, householdId: h.id, spouseId: null, parentIds: parents.map((p) => p.id),
    home: 'unassigned', coins: 0, inventory: [], needs: { daysHungry: 0, daysCold: 0, sleep: 1 }, alive: true,
    prices: {}, seen: {}, today: { offered: {}, sold: {}, missed: {} }, coinHistory: [], memories: [],
  };
  world.citizens.push(c);
  h.memberIds.push(c.id);
  return c;
}

/**
 * Brings a town saved by an older version up to date: a Town Hall for the mayor to work in, the mayor holding the
 * post, and a work trait for everyone (chosen by their id, not the dice, so the town's future is not disturbed).
 */
export function upgradeTown(world: World, data: GameData): void {
  if (!world.land.places.some((p) => p.key === 'townhall')) {
    const at = findHousePlot(world, 4, 3);
    if (at) {
      world.land.places.push({ key: 'townhall', label: 'Town Hall', sprite: 'townhall', x: at.x, y: at.y, w: 4, h: 3 });
      world.property.townhall = { owner: null, kind: 'town', deeds: [{ day: world.day, from: null, to: null, price: 0 }], rent: 0, arrears: 0 };
      world.buildings.townhall = { condition: 100 };
    }
  }
  const mayor = world.mayor ? world.citizens[world.mayor.id] : undefined;
  if (mayor?.alive && mayor.office !== 'mayor') { mayor.trade = null; mayor.speciality = undefined; mayor.workplace = undefined; mayor.employer = undefined; mayor.office = 'mayor'; }
  const work = [...data.traits.values()].filter((t) => t.kind === 'work').map((t) => t.id);
  for (const c of world.citizens) {
    c.traits = c.traits.filter((t) => data.traits.has(t));
    if (!c.traits.some((t) => work.includes(t))) c.traits.unshift(work[(c.id * 7919) % work.length]!);
  }
}

function rollTraits(world: World, data: GameData): string[] {
  // Everyone has one of the six work traits; half also have a temper.
  const of = (kind: string) => [...data.traits.values()].filter((t) => t.kind === kind).map((t) => t.id);
  const traits = [pick(world, of('work'))];
  if (random(world) < 0.5) traits.push(pick(world, of('temper')));
  return traits;
}

/** Creates founding stock made by a citizen of the right trade, with traceable input batches. */
function seedGood(world: World, data: GameData, holder: Holder, good: GoodId, qty: number): void {
  const batch = seedBatch(world, data, good, qty);
  const def = data.goods.get(good)!;
  if (def.kind === 'tool') {
    for (let i = 0; i < qty; i++) {
      const durability = Math.max(2, Math.round(def.durability! * (0.3 + 0.7 * random(world))));
      addLot(holder, { batch, good, qty: 1, unitCost: def.basePrice, durability });
    }
  } else {
    addLot(holder, { batch, good, qty, unitCost: def.basePrice });
  }
}

function seedBatch(world: World, data: GameData, good: GoodId, qty: number): BatchId {
  const recipe = data.recipes.find((r) => r.outputs[good]);
  if (!recipe) throw new Error(`no recipe makes ${good}`);
  const makers = world.citizens.filter((c) => c.trade === recipe.trade);
  const runs = Math.ceil(qty / recipe.outputs[good]!);
  const inputs = Object.entries(recipe.inputs).map(([g, q]) => ({ batch: seedBatch(world, data, g, q * runs), qty: q * runs }));
  return makeBatch(world, good, qty, pick(world, makers), recipe.id, inputs).id;
}
