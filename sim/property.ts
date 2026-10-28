// Land and property. Every building and site has an owner and a deed history. A few burghers (the richest
// households) own the town's businesses and most houses; the next few own the house they live in; everyone else
// rents. Tenants pay rent to their landlord, tradespeople pay the owner of the site they work a share of their
// sales, and employees are paid a daily wage by the business that employs them. Property changes hands on a market:
// owners sell when they need money, the wealthy bid, and prices follow what a property earns and how many want it.
// Burghers invest: they buy plots from the town and pay builders to put up houses to let or new businesses,
// which they name and give a speciality.
import businessesJson from '../data/businesses.json';
import { cheapestMeal, foodReserveCoins, recipesOf, talent } from './agent';
import { transfer } from './coins';
import type { GameData } from './data';
import { householdOf, isWorkingAge, livingMembers, takeUpTrade } from './family';
import { takeGoods } from './inventory';
import { findHousePlot } from './land';
import { buyBest, type DayTally } from './market';
import { policyOf } from './politics';
import { finishUpgrade } from './progress';
import { remember } from './memory';
import { random } from './rng';
import type { Citizen, Household, Place, Project, Property, Trade, World } from './types';

const B = businessesJson as unknown as {
  kinds: Record<string, { noun: string[]; niches: Record<string, string> }>;
  patterns: string[];
  tavernPatterns: string[];
  adjectives: string[];
  animals: string[];
};

/** The town's own buildings, which are not for sale. */
const TOWN = new Set(['market', 'church', 'granary', 'school', 'infirmary']);
/** Trades whose sites take employees for a wage; the rest are run by tradespeople who pay the owner a share. */
const EMPLOYING: ReadonlySet<Trade> = new Set(['farmer', 'lumberjack', 'miner', 'forager', 'fisherman']);
/** Businesses a burgher may open a new site for. */
const BUILDABLE: readonly Trade[] = ['baker', 'innkeeper', 'blacksmith', 'farmer'];

const surname = (c: Citizen) => c.name.split(' ').slice(1).join(' ');
const first = (c: Citizen) => c.name.split(' ')[0]!;
const tiles = (p: Place) => p.w * p.h;
const purseOf = (world: World, h: Household) => livingMembers(world, h).reduce((s, m) => s + m.coins, 0);
const dailyCost = (world: World, data: GameData, h: Household) =>
  livingMembers(world, h).length * cheapestMeal(data, world.citizens[h.headId]!) + 4;

export function tradeOfSite(key: string): Trade | undefined {
  return key.startsWith('work:') ? (key.split(':')[1] as Trade) : undefined;
}

/** The site someone works at: their own, or their trade's first site. */
export function workplaceOf(c: Citizen): string | undefined {
  return c.trade ? c.workplace ?? `work:${c.trade}` : undefined;
}

/** A stable choice for naming, from the seed and the place, so naming never touches the economy's random stream. */
function pickName<T>(world: World, salt: string, items: readonly T[]): T {
  let h = world.seed * 31;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761);
  return items[(h >>> 0) % items.length]!;
}

/** Names a business and picks its speciality: "Vane & Sons Bakery, known for pies", "The Golden Hart". */
export function nameBusiness(world: World, owner: Citizen, key: string, trade: Trade): { name: string; niche: string } {
  const kind = B.kinds[trade] ?? { noun: ['Works'], niches: { general: '' } };
  const niche = pickName(world, `${key}:niche`, Object.keys(kind.niches));
  const patterns = trade === 'innkeeper' ? B.tavernPatterns : B.patterns;
  const name = pickName(world, `${key}:pattern`, patterns)
    .replace('{family}', surname(owner)).replace('{first}', first(owner))
    .replace('{noun}', pickName(world, `${key}:noun`, kind.noun))
    .replace('{adjective}', pickName(world, `${key}:adj`, B.adjectives))
    .replace('{animal2}', pickName(world, `${key}:animal2`, B.animals))
    .replace('{animal}', pickName(world, `${key}:animal`, B.animals));
  return { name, niche };
}

/** The recipe a site's speciality favours, if any. */
export function nicheRecipe(world: World, c: Citizen): string | undefined {
  const site = workplaceOf(c);
  const p = site ? world.property[site] : undefined;
  return p?.trade && p.niche ? B.kinds[p.trade]?.niches[p.niche] || undefined : undefined;
}

/** A house's daily rent at today's food prices. */
function fairRent(data: GameData, place: Place, someone: Citizen): number {
  return Math.max(1, Math.round(tiles(place) * data.town.property.rentPerTileMeals * cheapestMeal(data, someone)));
}

/** The most rent the mayor allows on a house, if their doctrine caps rents. */
function rentCap(world: World, data: GameData, key: string): number {
  const cap = policyOf(world, data).rentCapMeals;
  const place = world.land.places.find((p) => p.key === key);
  return cap === null || !place ? Infinity : Math.max(1, Math.round(tiles(place) * cap * cheapestMeal(data, world.citizens[0]!)));
}

/** At the founding: burghers own the businesses and most houses, the well-off own their homes, the rest rent. */
export function initialProperty(world: World, data: GameData): Record<string, Property> {
  const cfg = data.town.property;
  const homes = [...world.households].sort((a, b) => purseOf(world, b) - purseOf(world, a));
  const nBurghers = Math.max(1, Math.round(homes.length * cfg.burgherShare));
  const burghers = homes.slice(0, nBurghers).map((h) => world.citizens[h.headId]!);
  const owners = new Set(homes.slice(0, nBurghers + Math.round(homes.length * cfg.ownHomeShare)).map((h) => h.id));
  const out: Record<string, Property> = {};
  world.land.places.forEach((p, i) => {
    const grant = (owner: number | null) => [{ day: 0, from: null, to: owner, price: 0 }];
    if (TOWN.has(p.key)) {
      out[p.key] = { owner: null, kind: 'town', deeds: grant(null), rent: 0, arrears: 0 };
    } else if (p.key.startsWith('home:')) {
      const hid = Number(p.key.slice(5));
      const ownHome = owners.has(hid);
      const owner = ownHome ? world.households[hid]!.headId : burghers[i % burghers.length]!.id;
      const someone = world.citizens[world.households[hid]!.headId]!;
      // Most families start in a cottage; a few in a house, the richest in a townhouse.
      const tier = p.sprite === 'townhouse' ? 3 : p.w * p.h <= 4 ? 1 : 2;
      out[p.key] = { owner, kind: 'home', deeds: grant(owner), rent: ownHome ? 0 : fairRent(data, p, someone), arrears: 0, tier };
    } else {
      const owner = burghers[i % burghers.length]!;
      const trade = tradeOfSite(p.key);
      const named = trade ? nameBusiness(world, owner, p.key, trade) : undefined;
      out[p.key] = { owner: owner.id, kind: 'business', deeds: grant(owner.id), rent: 0, arrears: 0, trade, ...named };
      if (named) p.label = named.name;
    }
  });
  return out;
}

/** What a property earns its owner per day (rent for a house, site fees or employees' output for a business). */
function earnings(world: World, data: GameData, key: string, p: Property): number {
  if (p.kind === 'home') {
    const place = world.land.places.find((q) => q.key === key)!;
    return p.rent || fairRent(data, place, world.citizens[0]!);
  }
  const workers = world.citizens.filter((c) => c.alive && workplaceOf(c) === key);
  const sales = workers.reduce((s, c) => s + (c.today.revenue ?? 0), 0);
  return Math.max(1, sales * data.town.property.siteFeeShare + workers.length);
}

/** What a property is worth: what it earns over the payback period. */
export function valueOf(world: World, data: GameData, key: string): number {
  const p = world.property[key]!;
  return Math.round(earnings(world, data, key, p) * data.town.property.paybackDays);
}

/** Daily: rent, site fees and wages are paid; property is bought and sold; burghers invest and hire. */
export function propertyDay(world: World, data: GameData, tally: DayTally, events: string[]): { sales: string[]; rentPaid: number } {
  const cfg = data.town.property;
  let rentPaid = 0;

  // Tenants pay rent. A household that cannot pay runs up arrears, and the landlord lowers the rent.
  for (const [key, p] of Object.entries(world.property)) {
    if (p.kind !== 'home' || p.owner === null || !p.rent || !key.startsWith('home:')) continue;
    const h = world.households[Number(key.slice(5))];
    if (!h) continue;
    const members = livingMembers(world, h);
    const owner = world.citizens[p.owner]!;
    if (!members.length || members.includes(owner)) continue;
    const payer = [...members].sort((x, y) => y.coins - x.coins)[0]!;
    const pay = Math.min(p.rent, Math.max(0, payer.coins - Math.ceil(cheapestMeal(data, payer) * members.length)));
    if (pay > 0) { transfer(world, payer, owner, pay, `rent for the ${h.family} house`); rentPaid += pay; }
    if (pay < p.rent) {
      p.arrears += p.rent - pay;
      if (p.arrears > p.rent * 5) { p.rent = Math.max(1, Math.floor(p.rent / cfg.rentStep)); p.arrears = Math.floor(p.arrears / 2); }
    }
  }

  // Tradespeople pay a share of today's sales to the owner of their site; employers pay their employees.
  for (const c of world.citizens) {
    if (!c.alive) continue;
    const site = workplaceOf(c);
    const owner = site ? world.property[site]?.owner : undefined;
    if (typeof owner === 'number' && owner !== c.id && c.employer === undefined) {
      const fee = Math.min(c.coins, Math.floor((c.today.revenue ?? 0) * cfg.siteFeeShare));
      if (fee > 0) { transfer(world, c, world.citizens[owner]!, fee, `site fee at ${site}`); rentPaid += fee; }
    }
    if (c.employer !== undefined) {
      const boss = world.citizens[c.employer]!;
      const wage = Math.ceil(cfg.wageMeals * cheapestMeal(data, boss));
      if (!boss.alive || boss.coins < wage) {
        events.push(`${c.name} is let go by ${boss.name}, who cannot pay`);
        c.employer = undefined;
        continue;
      }
      transfer(world, boss, c, wage, 'wages');
    }
  }

  const sales = [...landMarket(world, data), ...(world.day % cfg.reviewEveryDays === 3 ? offers(world, data) : [])];
  if (world.day % cfg.reviewEveryDays === 0) {
    events.push(...adjustRents(world, data), ...develop(world, data), ...hire(world, data));
  }
  events.push(...housePeople(world, data));
  return { sales, rentPaid };
}

/** The head of someone's household (or themselves), who holds the household's deeds. */
function householdHead(world: World, c: Citizen): Citizen {
  const head = world.citizens[householdOf(world, c).headId]!;
  return head.alive ? head : c;
}

/** Households rich enough to buy property: only the richest few (property.investorShare of households). */
function wealthyFew(world: World, data: GameData): Set<number> {
  const homes = world.households.filter((h) => livingMembers(world, h).length).sort((a, b) => purseOf(world, b) - purseOf(world, a));
  return new Set(homes.slice(0, Math.max(1, Math.round(homes.length * data.town.property.investorShare))).map((h) => h.id));
}

/** Owners short of money put property up for sale; the wealthy bid; the best bid wins, at a price set by competition. */
function landMarket(world: World, data: GameData): string[] {
  const cfg = data.town.property;
  const sales: string[] = [];
  for (const [key, p] of Object.entries(world.property)) {
    if (p.owner === null || p.kind === 'town') continue;
    const owner = world.citizens[p.owner]!;
    const h = householdOf(world, owner);
    // An owner's own home is the last thing they sell.
    const ownHome = key === `home:${h.id}`;
    if (!p.forSale && !ownHome && (!owner.alive || purseOf(world, h) < cfg.sellWhenShortDays * dailyCost(world, data, h))) {
      p.forSale = { asking: Math.round(valueOf(world, data, key) * 1.1), since: world.day };
    }
    if (!p.forSale) continue;
    p.forSale.asking = Math.max(1, Math.round(p.forSale.asking * cfg.markdownPerDay));
    // Bidders: households with plenty to spare, valuing it at what it earns (more if they already own the trade).
    const value = valueOf(world, data, key);
    const few = wealthyFew(world, data);
    const bids = world.households
      .filter((b) => b.id !== h.id && few.has(b.id) && livingMembers(world, b).length)
      .map((b) => ({ b, spare: Math.floor(purseOf(world, b) - cfg.buyAboveDays * dailyCost(world, data, b)) }))
      .filter((x) => x.spare >= p.forSale!.asking)
      .map((x) => ({ ...x, worth: Math.min(x.spare, Math.round(value * (0.9 + random(world) * 0.3))) }))
      .filter((x) => x.worth >= p.forSale!.asking)
      .sort((x, y) => y.worth - x.worth);
    if (!bids.length) continue;
    // With rivals, the price is bid up to just above the second best offer.
    const price = bids.length > 1 ? Math.min(bids[0]!.worth, Math.max(p.forSale.asking, bids[1]!.worth + 1)) : p.forSale.asking;
    const buyer = [...livingMembers(world, bids[0]!.b)].sort((x, y) => y.coins - x.coins)[0]!;
    if (buyer.coins < price) continue;
    transfer(world, buyer, owner, price, `buying ${key}`);
    // The household pays from whoever holds its money; the head holds the deed.
    const holder = householdHead(world, buyer);
    p.deeds.push({ day: world.day, from: owner.id, to: holder.id, price });
    p.owner = holder.id;
    p.forSale = undefined;
    const label = world.land.places.find((q) => q.key === key)?.label ?? key;
    sales.push(`${buyer.name} bought ${label} from ${owner.name} for ${price} coins`);
    remember(world, buyer, 'bought_property', { place: label });
  }
  return sales;
}

/**
 * Weekly: households with money to spare make offers on property that would pay them back well. The more of them
 * there are, the more they offer (competition for scarce land). An owner sells when the best offer clearly beats
 * what the property is worth to them; their own home is not for sale.
 */
function offers(world: World, data: GameData): string[] {
  const cfg = data.town.property;
  const sales: string[] = [];
  const few = wealthyFew(world, data);
  const investors = world.households
    .filter((h) => few.has(h.id))
    .map((h) => ({ h, spare: Math.floor(purseOf(world, h) - cfg.investAboveDays * dailyCost(world, data, h)), bought: false }))
    .filter((x) => x.spare > 0 && livingMembers(world, x.h).length);
  if (!investors.length) return sales;
  const competition = 1 + Math.min(0.5, investors.length * 0.05);
  for (const [key, p] of Object.entries(world.property)) {
    if (p.owner === null || p.kind === 'town' || p.forSale) continue;
    const owner = world.citizens[p.owner]!;
    if (key === `home:${owner.householdId}`) continue;
    const value = valueOf(world, data, key);
    // Each investor bids what it is worth to them, pushed up by how many are after property, up to what they can spare.
    const bids = investors
      .filter((x) => x.h.id !== owner.householdId && !x.bought)
      .map((x) => ({ ...x, bid: Math.min(x.spare, Math.round(value * competition * (0.85 + random(world) * 0.3))) }))
      .sort((a, b) => b.bid - a.bid);
    const top = bids[0];
    if (!top || top.bid < value * cfg.sellAbove) continue;
    const price = bids[1] ? Math.max(Math.round(value * cfg.sellAbove), Math.min(top.bid, bids[1].bid + 1)) : top.bid;
    const buyer = [...livingMembers(world, top.h)].sort((x, y) => y.coins - x.coins)[0]!;
    if (buyer.coins < price) continue;
    transfer(world, buyer, owner, price, `buying ${key}`);
    // The household pays from whoever holds its money; the head holds the deed.
    const holder = householdHead(world, buyer);
    p.deeds.push({ day: world.day, from: owner.id, to: holder.id, price });
    p.owner = holder.id;
    top.spare -= price;
    top.bought = true; // one purchase a week each
    const label = world.land.places.find((q) => q.key === key)?.label ?? key;
    sales.push(`${buyer.name} bought ${label} from ${owner.name} for ${price} coins`);
    remember(world, buyer, 'bought_property', { place: label });
  }
  return sales;
}

/** Landlords raise rents when people are waiting for houses, and lower them on houses that stand empty. */
function adjustRents(world: World, data: GameData): string[] {
  const cfg = data.town.property;
  const demand = world.waiting.length;
  for (const [key, p] of Object.entries(world.property)) {
    if (p.kind !== 'home' || !p.rent) continue;
    const h = key.startsWith('home:') ? world.households[Number(key.slice(5))] : undefined;
    const empty = !h || !livingMembers(world, h).length;
    if (empty) p.rent = Math.max(1, Math.floor(p.rent / cfg.rentStep));
    else if (demand > 0 && p.arrears === 0) p.rent = Math.ceil(p.rent * cfg.rentStep);
    p.rent = Math.min(p.rent, rentCap(world, data, key));
  }
  return [];
}

/** Couples waiting for a home move into an empty house to let. */
function housePeople(world: World, data: GameData): string[] {
  const events: string[] = [];
  world.waiting = world.waiting.filter(({ a, b }) => {
    const ca = world.citizens[a]!;
    const cb = world.citizens[b]!;
    if (!ca.alive || !cb.alive) return false;
    const empty = Object.entries(world.property).find(([key, p]) => p.kind === 'home' && p.rent > 0 && key.startsWith('home:')
      && !livingMembers(world, world.households[Number(key.slice(5))]!).length);
    if (!empty) return true;
    const [oldKey, prop] = empty;
    const h: Household = { id: world.households.length, family: surname(ca), kind: 'couple', headId: ca.id, memberIds: [] };
    world.households.push(h);
    for (const c of [ca, cb]) moveOut(world, c, h);
    rekey(world, oldKey, `home:${h.id}`, `${h.family} house`);
    prop.arrears = 0;
    events.push(`${ca.name} and ${cb.name} rented a house of their own`);
    void data;
    return false;
  });
  return events;
}

/** Moves someone to another household; if they headed the old one, its eldest remaining member takes over. */
export function moveOut(world: World, c: Citizen, to: Household): void {
  const from = householdOf(world, c);
  from.memberIds = from.memberIds.filter((id) => id !== c.id);
  to.memberIds.push(c.id);
  c.householdId = to.id;
  if (from.headId === c.id) {
    const rest = livingMembers(world, from).sort((x, y) => y.age - x.age);
    if (rest[0]) from.headId = rest[0].id;
  }
}

/** Gives a place a new key (a house taken by a new household) everywhere it is recorded. */
function rekey(world: World, from: string, to: string, label?: string): void {
  const place = world.land.places.find((p) => p.key === from);
  if (place) { place.key = to; if (label) place.label = label; }
  if (world.property[from]) { world.property[to] = world.property[from]!; delete world.property[from]; }
  if (world.buildings[from]) { world.buildings[to] = world.buildings[from]!; delete world.buildings[from]; }
  for (const c of world.citizens) if (c.workplace === from) c.workplace = to;
  for (const pr of world.projects) if (pr.key === from) pr.key = to;
}

/**
 * Burghers with money to spare invest: a house to let when couples are waiting for homes, otherwise a new business
 * in the trade that is doing best. They buy the plot from the town and pay builders day by day.
 */
function develop(world: World, data: GameData): string[] {
  const cfg = data.town.property;
  const events: string[] = [];
  const owners = new Set(Object.values(world.property).map((p) => p.owner).filter((o): o is number => o !== null));
  for (const id of owners) {
    const b = world.citizens[id]!;
    if (!b.alive || world.projects.some((p) => p.owner === id)) continue;
    const h = householdOf(world, b);
    const plotPrice = Math.ceil(cfg.plotPriceMeals * cheapestMeal(data, b) * policyOf(world, data).plotPriceFactor);
    const buildCost = estimateBuild(world, data, b);
    if (purseOf(world, h) < cfg.developAboveDays * dailyCost(world, data, h) + plotPrice + buildCost || b.coins < plotPrice) continue;
    const vacant = Object.entries(world.property).some(([k, p]) => p.kind === 'home' && p.rent > 0 && !livingMembers(world, world.households[Number(k.slice(5))] ?? { memberIds: [] } as unknown as Household).length);
    const wantHouse = world.waiting.length > 0 && !vacant;
    const trade = wantHouse ? undefined : bestTrade(world, data);
    if (!wantHouse && !trade) continue;
    const [w, hh] = wantHouse ? [3, 2] : trade === 'farmer' ? [6, 4] : [3, 3];
    const plot = findHousePlot(world, w, hh);
    if (!plot) continue;
    transfer(world, b, world.treasury, plotPrice, 'buying a building plot from the town');
    const key = wantHouse ? `plot:${world.day}:${id}` : `work:${trade}:${world.day}:${id}`;
    world.land.places.push({ key, label: wantHouse ? `New house for ${b.name} (building)` : `New ${trade} site for ${b.name} (building)`, sprite: 'site', x: plot.x, y: plot.y, w, h: hh });
    world.property[key] = { owner: id, kind: wantHouse ? 'home' : 'business', deeds: [{ day: world.day, from: null, to: id, price: plotPrice }], rent: 0, arrears: 0, trade };
    world.projects.push({ key, owner: id, kind: wantHouse ? 'home' : 'business', trade, progress: 0, days: data.town.construction.newHouseDays + (wantHouse ? 0 : 2) });
    events.push(`${b.name} bought a plot from the town and hired builders for ${wantHouse ? 'a house to let' : `a new ${trade}'s site`}`);
  }
  return events;
}

function estimateBuild(world: World, data: GameData, b: Citizen): number {
  const { construction } = data.town;
  let cost = 0;
  for (const [g, q] of Object.entries(construction.newHouseMaterials)) cost += q * (b.seen[g]?.avg ?? data.goods.get(g)!.basePrice);
  return Math.ceil(cost + construction.newHouseDays * construction.labourMeals * cheapestMeal(data, b));
}

/** The trade worth a new site: the one whose workers earned most lately, among those that can be built. */
function bestTrade(world: World, data: GameData): Trade | undefined {
  let best: { t: Trade; s: number } | undefined;
  for (const t of BUILDABLE) {
    const ws = world.citizens.filter((c) => c.alive && c.trade === t && c.coinHistory.length >= 2);
    if (!ws.length) continue;
    const nets = ws.map((c) => c.coins - c.coinHistory[0]!).sort((a, b) => a - b);
    const median = nets[Math.floor(nets.length / 2)]!;
    const crowd = world.citizens.filter((c) => c.alive && c.trade === t).length / Math.max(1, Object.values(world.property).filter((p) => p.trade === t).length);
    const s = median - crowd;
    if (s > 5 && (!best || s > best.s)) best = { t, s };
  }
  void data;
  return best?.t;
}

/** Builders work on burghers' projects; each day takes a share of the materials and a day's labour, paid by the owner. */
export function buildProjects(world: World, data: GameData, tally: DayTally, builders: Citizen[], news: string[]): void {
  const { construction } = data.town;
  for (const project of world.projects) {
    const builder = builders.find((c) => !c.today.job);
    if (!builder) break;
    const owner = world.citizens[project.owner]!;
    if (!owner.alive) continue;
    const labour = Math.ceil(construction.labourMeals * cheapestMeal(data, builder));
    const share = Object.entries(construction.newHouseMaterials).map(([g, q]) => [g, Math.ceil(q / construction.newHouseDays)] as const);
    let estimate = labour;
    for (const [g, q] of share) estimate += q * (builder.seen[g]?.avg ?? data.goods.get(g)!.basePrice);
    if (owner.coins - estimate < foodReserveCoins(world, data, owner)) continue;
    const before = builder.coins;
    let missing = false;
    for (const [g, q] of share) {
      const have = builder.inventory.filter((l) => l.good === g).reduce((s, l) => s + l.qty, 0);
      if (have < q) buyBest(world, data, builder, [g], q - have, foodReserveCoins(world, data, builder), tally);
      if (builder.inventory.filter((l) => l.good === g).reduce((s, l) => s + l.qty, 0) < q) missing = true;
    }
    if (missing) continue;
    for (const [g, q] of share) takeGoods(builder, g, q);
    transfer(world, owner, builder, Math.min(owner.coins, before - builder.coins + labour), `building for ${owner.name}`);
    builder.today.job = project.key;
    // An able builder gets through more of the work in a day.
    project.progress += talent(data, builder, 'builder');
    if (project.progress >= project.days) news.push(finishProject(world, data, project));
  }
  world.projects = world.projects.filter((p) => p.progress < p.days && world.citizens[p.owner]!.alive);
}

function finishProject(world: World, data: GameData, project: Project): string {
  const owner = world.citizens[project.owner]!;
  if (project.kind === 'upgrade') return finishUpgrade(world, project.key, owner);
  const place = world.land.places.find((p) => p.key === project.key)!;
  const prop = world.property[project.key]!;
  world.buildings[project.key] = { condition: 100 };
  if (project.kind === 'home') {
    // An empty house to let, keyed as a household that does not exist yet; whoever moves in takes it over.
    const h: Household = { id: world.households.length, family: surname(owner), kind: 'empty', headId: owner.id, memberIds: [] };
    world.households.push(h);
    const key = `home:${h.id}`;
    place.sprite = 'house';
    prop.rent = fairRent(data, place, owner);
    prop.tier = 2;
    rekey(world, project.key, key, `House to let (${owner.name})`);
    return `${owner.name}'s new house is ready to let`;
  }
  const named = nameBusiness(world, owner, project.key, project.trade!);
  prop.name = named.name;
  prop.niche = named.niche;
  place.label = named.name;
  place.sprite = { baker: 'bakery', innkeeper: 'tavern', blacksmith: 'smithy', farmer: 'fields' }[project.trade as string] ?? 'yard';
  // A tradesperson from the most crowded site of that trade moves to work here.
  const mover = world.citizens.find((c) => c.alive && c.trade === project.trade && c.employer === undefined && workplaceOf(c) !== project.key);
  if (mover) mover.workplace = project.key;
  return `${owner.name} opened ${named.name}${mover ? `, where ${mover.name} now works` : ''}`;
}

/** Owners of farms, woods, quarries and fisheries take on employees when their output is worth more than a wage. */
function hire(world: World, data: GameData): string[] {
  const cfg = data.town.property;
  const events: string[] = [];
  for (const [key, p] of Object.entries(world.property)) {
    if (p.kind !== 'business' || p.owner === null || !p.trade || !EMPLOYING.has(p.trade)) continue;
    const boss = world.citizens[p.owner]!;
    const wage = Math.ceil(cfg.wageMeals * cheapestMeal(data, boss));
    const staff = world.citizens.filter((c) => c.alive && c.employer === boss.id).length;
    if (!boss.alive || boss.coins < wage * 30 * (staff + 1)) continue;
    // Worth it if a day's output sells for well above the wage.
    const recipe = data.recipesByTrade[p.trade][0];
    if (!recipe) continue;
    const [good, qty] = Object.entries(recipe.outputs)[0]!;
    const price = boss.prices[good] ?? boss.seen[good]?.avg ?? data.goods.get(good)!.basePrice;
    if (qty * price < wage * 1.4) continue;
    const who = world.citizens.find((c) => c.alive && isWorkingAge(data, c) && !c.office && c.employer === undefined
      && c.householdId !== boss.householdId && (!c.trade || (c.trade === p.trade && c.coins - (c.coinHistory[0] ?? c.coins) < wage * 5)));
    if (!who) continue;
    if (who.trade !== p.trade) takeUpTrade(data, who, p.trade);
    who.employer = boss.id;
    who.workplace = key;
    boss.prices[good] ??= price;
    remember(world, who, 'started_work', { to: p.trade });
    events.push(`${who.name} took work for wages at ${p.name ?? key} (${boss.name})`);
  }
  return events;
}

/** Recipes worth favouring at a site with a speciality: the niche's recipe counts for more. */
export function nicheBonus(world: World, c: Citizen, recipe: string): number {
  return nicheRecipe(world, c) === recipe ? 1.3 : 1;
}

export { recipesOf };
