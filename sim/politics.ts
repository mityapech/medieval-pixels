// Town politics. Every term the town elects a mayor; the mayor's doctrine sets the town's policy while in office:
// taxes, how many public posts it pays for, tariffs and exports, welfare through the church, rent caps and the price
// of building plots. Candidates are the town's notables; people vote by their interests and by how the town fared.
import politicsJson from '../data/politics.json';
import { cheapestMeal } from './agent';
import { transfer } from './coins';
import type { GameData } from './data';
import { householdOf, isAdult, livingMembers, takeUpTrade } from './family';
import { remember } from './memory';
import { random } from './rng';
import type { Citizen, Doctrine, Policy, World } from './types';

const P = politicsJson as unknown as {
  termDays: number;
  campaignDays: number;
  mayorStipendMeals: number;
  doctrines: Record<Doctrine, { name: string; slogan: string; policy: Omit<Policy, 'doctrine'> }>;
};
export const DOCTRINES = Object.keys(P.doctrines) as Doctrine[];

export function doctrineName(d: Doctrine): string {
  return P.doctrines[d].name;
}
export function doctrineSlogan(d: Doctrine): string {
  return P.doctrines[d].slogan;
}

/** The policy in force: the mayor's doctrine, or the town's old ways (town.json) before any election. */
export function policyOf(world: World, data: GameData): Policy {
  return policyFor(world.mayor?.doctrine ?? null, data);
}

/** The policy a doctrine stands for (null: the town's old ways, from town.json). */
export function policyFor(doctrine: Doctrine | null, data: GameData): Policy {
  if (doctrine) return { doctrine, ...P.doctrines[doctrine].policy };
  const a = data.town.authority;
  return {
    doctrine: null, marketTax: a.marketTax, hearthTaxShare: a.hearthTaxShare, churchGrantShare: a.churchGrantShare,
    wageBudgetShare: a.wageBudgetShare, posts: { healer: 1, teacher: 1, priest: 1, guard: 1 }, tariff: 0, exportFood: true,
    rentCapMeals: null, plotPriceFactor: 1, roadCostFactor: 1, granaryFactor: 1,
  };
}

const purse = (world: World, c: Citizen) => livingMembers(world, householdOf(world, c)).reduce((s, m) => s + m.coins, 0);
const ownsProperty = (world: World, c: Citizen) =>
  Object.entries(world.property).some(([k, p]) => p.owner === c.id && k !== `home:${c.householdId}`);
const GATHERERS = new Set(['farmer', 'fisherman', 'forager', 'lumberjack', 'miner']);

/** What a citizen would stand for if they ran: it follows from their place in town. */
function leaning(world: World, data: GameData, c: Citizen): Doctrine[] {
  const rich = purse(world, c) > 60 * cheapestMeal(data, c) * livingMembers(world, householdOf(world, c)).length;
  if (c.office === 'priest' || c.office === 'guard') return ['traditionalist', 'isolationist', 'liberal', 'freemarket'];
  if (c.office === 'teacher' || c.office === 'healer') return ['liberal', 'traditionalist', 'isolationist', 'freemarket'];
  if (c.trade === 'merchant' || ownsProperty(world, c)) return c.traits.includes('greedy') || rich ? ['freemarket', 'traditionalist', 'isolationist', 'liberal'] : ['traditionalist', 'freemarket', 'isolationist', 'liberal'];
  if (c.trade && GATHERERS.has(c.trade)) return ['isolationist', 'liberal', 'traditionalist', 'freemarket'];
  return rich ? ['freemarket', 'traditionalist', 'liberal', 'isolationist'] : ['liberal', 'isolationist', 'traditionalist', 'freemarket'];
}

/** How much a voter likes each doctrine, from their own situation and how the town has fared under the mayor. */
function appeal(world: World, data: GameData, v: Citizen, d: Doctrine): number {
  const members = livingMembers(world, householdOf(world, v));
  const meal = cheapestMeal(data, v);
  const p = purse(world, v);
  const struggling = p < 10 * meal * members.length;
  const rich = p > 60 * meal * members.length;
  const recent = world.reports.slice(-P.termDays);
  const imports = recent.reduce((s, r) => s + r.imports, 0);
  const exports = recent.reduce((s, r) => s + r.exports, 0);
  const troubles = recent.some((r) => r.eventsStarted.some((e) => /fire|Bandits/.test(e)));
  let s = random(world) * 1.5;
  if (d === 'liberal') s += (struggling ? 2 : 0) + (members.some((m) => m.age >= 6 && m.age <= 11) ? 1 : 0) + (v.office === 'teacher' || v.office === 'healer' ? 2 : 0) + (v.sick ? 1 : 0);
  if (d === 'traditionalist') s += (v.office === 'guard' || v.office === 'priest' ? 2 : 0) + (v.age >= 50 ? 1 : 0) + (troubles ? 1 : 0);
  if (d === 'isolationist') s += (v.trade && GATHERERS.has(v.trade) ? 1 : 0) + (imports > exports * 1.5 ? 1.5 : 0) + (v.needs.daysHungry > 0 ? 1 : 0);
  // Low taxes appeal to anyone getting by, most of all to owners, traders and those who sell to other towns.
  if (d === 'freemarket') s += (ownsProperty(world, v) ? 3 : 0) + (v.trade === 'merchant' ? 2 : 0) + (rich ? 1.5 : struggling ? -1 : 0.6) + (exports > imports ? 0.5 : 0);
  // The sitting mayor's doctrine is judged on the town's fortunes during the term.
  if (world.mayor?.doctrine === d && recent.length > 1) {
    const before = recent[0]!.fortune.score;
    const now = recent.at(-1)!.fortune.score;
    s += now > before + 2 ? 1.5 : now < before - 2 ? -1.5 : 0;
    s -= recent.reduce((n, r) => n + r.starved.length, 0) > 0 ? 2 : 0;
  }
  return s;
}

/** Daily: pay the mayor; hold an election when a term ends or the mayor has died. Returns news. */
export function politicsDay(world: World, data: GameData): { news: string[]; election?: Election } {
  const news: string[] = [];
  if (world.mayor) {
    const m = world.citizens[world.mayor.id]!;
    if (m.alive) {
      const stipend = Math.min(world.treasury.coins, Math.ceil(P.mayorStipendMeals * cheapestMeal(data, m)));
      if (stipend > 0) transfer(world, world.treasury, m, stipend, "mayor's stipend");
    }
  }
  // A few days before a term ends the candidates are named and campaign at the market.
  if (world.mayor && !world.campaign && world.day >= world.mayor.termEnds - P.campaignDays && world.citizens[world.mayor.id]!.alive) {
    const candidates = chooseCandidates(world, data);
    if (candidates.length) {
      world.campaign = { from: world.day, candidates: candidates.map((x) => ({ id: x.c.id, doctrine: x.doctrine })) };
      news.push(`The campaign for mayor begins: ${candidates.map((x) => `${x.c.name} (${doctrineName(x.doctrine)})`).join(', ')}. Election in ${world.mayor.termEnds - world.day} days.`);
    }
  }
  const due = !world.mayor || world.day >= world.mayor.termEnds || !world.citizens[world.mayor.id]!.alive;
  if (!due) return { news };
  const before = policyOf(world, data);
  const outgoing = world.mayor;
  const election = holdElection(world, data);
  if (election) {
    const changes = policyChanges(before, policyOf(world, data), outgoing?.id === election.winner);
    for (const text of changes) world.decrees.push({ day: world.day, mayor: election.winner, text });
  }
  if (election) news.push(`Election: ${election.winnerName} (${doctrineName(election.doctrine)}) is mayor, with ${election.votes[election.winner]} of ${Object.values(election.votes).reduce((s, n) => s + n, 0)} votes. "${doctrineSlogan(election.doctrine)}"`);
  return { news, election };
}

export interface Election {
  day: number;
  candidates: { id: number; name: string; doctrine: Doctrine }[];
  votes: Record<number, number>;
  ballots: Record<number, number>;
  winner: number;
  winnerName: string;
  doctrine: Doctrine;
}

/** The notables who stand: the most established adults over 28 (wealth, property, office), one per doctrine where possible. */
function chooseCandidates(world: World, data: GameData): { c: Citizen; doctrine: Doctrine }[] {
  const standing = (c: Citizen) => purse(world, c) + (ownsProperty(world, c) ? 500 : 0) + (c.office === 'priest' ? 200 : 0) + c.age;
  const notables = world.citizens.filter((c) => c.alive && c.age >= 28 && c.age < 75 && !c.sick).sort((a, b) => standing(b) - standing(a)).slice(0, 8);
  const candidates: { c: Citizen; doctrine: Doctrine }[] = [];
  for (const c of notables) {
    if (candidates.length >= 3) break;
    if (candidates.some((x) => x.c.householdId === c.householdId)) continue;
    const d = leaning(world, data, c).find((x) => !candidates.some((y) => y.doctrine === x));
    if (d) candidates.push({ c, doctrine: d });
  }
  return candidates;
}

/** What changes when a new mayor takes office, in words: taxes, posts, trade, welfare, rent, building. */
function policyChanges(before: Policy, after: Policy, reelected: boolean): string[] {
  if (reelected && before.doctrine === after.doctrine) return ['Re-elected: carries on as before.'];
  const out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const move = (what: string, a: number, b: number, show: (x: number) => string) => {
    if (Math.abs(a - b) < 1e-9) return;
    out.push(`${b > a ? 'Raised' : 'Lowered'} ${what} from ${show(a)} to ${show(b)}`);
  };
  move('the market tax', before.marketTax, after.marketTax, pct);
  move('the tax on savings', before.hearthTaxShare, after.hearthTaxShare, pct);
  move('the tariff on imports', before.tariff, after.tariff, pct);
  move("the church's share of the treasury surplus (alms)", before.churchGrantShare, after.churchGrantShare, pct);
  move('the budget for public wages', before.wageBudgetShare, after.wageBudgetShare, pct);
  for (const [post, label] of [['healer', 'healers'], ['teacher', 'teachers'], ['priest', 'priests'], ['guard', 'guards']] as const) {
    const a = before.posts[post];
    const b = after.posts[post];
    if (b > a) out.push(`Wants more ${label} (${Math.round(b * 100)}% of the usual need)`);
    if (b < a) out.push(`Cuts ${label} (${Math.round(b * 100)}% of the usual need)`);
  }
  if (before.exportFood && !after.exportFood) out.push('Banned food from leaving town');
  if (!before.exportFood && after.exportFood) out.push('Lifted the ban on food exports');
  if (after.rentCapMeals !== null && before.rentCapMeals === null) out.push('Capped rents');
  if (after.rentCapMeals === null && before.rentCapMeals !== null) out.push('Lifted the cap on rents');
  move('the price of building plots', before.plotPriceFactor, after.plotPriceFactor, (x) => `${Math.round(x * 100)}%`);
  move('the cost of the roads to other towns', before.roadCostFactor, after.roadCostFactor, (x) => `${Math.round(x * 100)}%`);
  move('the granary stores', before.granaryFactor, after.granaryFactor, (x) => `${Math.round(x * 100)}%`);
  return out.length ? out : ['Keeps the policy as it was.'];
}

function holdElection(world: World, data: GameData): Election | undefined {
  // The campaign's candidates stand if they still can; otherwise (or with no campaign) the notables of the day.
  const campaigned = (world.campaign?.candidates ?? [])
    .map((x) => ({ c: world.citizens[x.id]!, doctrine: x.doctrine }))
    .filter((x) => x.c.alive && !x.c.sick);
  const candidates = campaigned.length >= 2 ? campaigned : chooseCandidates(world, data);
  world.campaign = undefined;
  if (!candidates.length) return undefined;
  const ballots: Record<number, number> = {};
  const votes: Record<number, number> = Object.fromEntries(candidates.map((x) => [x.c.id, 0]));
  for (const v of world.citizens) {
    if (!v.alive || !isAdult(data, v) || v.age < 16) continue;
    const best = candidates.map((x) => ({ x, s: appeal(world, data, v, x.doctrine) + (x.c.householdId === v.householdId ? 3 : 0) }))
      .sort((a, b) => b.s - a.s)[0]!.x;
    votes[best.c.id]!++;
    ballots[v.id] = best.c.id;
    remember(world, v, 'voted', { name: best.c.name.split(' ')[0]!, doctrine: doctrineName(best.doctrine) });
  }
  const win = [...candidates].sort((a, b) => votes[b.c.id]! - votes[a.c.id]!)[0]!;
  // Being mayor is a post: the old mayor goes back to finding work, the new one leaves their trade for the Town Hall.
  const old = world.mayor ? world.citizens[world.mayor.id]! : undefined;
  if (old && old !== win.c && old.office === 'mayor') old.office = null;
  if (win.c.office !== 'mayor') {
    takeUpTrade(data, win.c, null);
    win.c.office = 'mayor';
    win.c.employerHousehold = null;
    win.c.employer = undefined;
  }
  world.mayor = { id: win.c.id, doctrine: win.doctrine, since: world.day, termEnds: world.day + P.termDays };
  world.elections.push({ day: world.day, mayor: win.c.id, doctrine: win.doctrine });
  remember(world, win.c, 'elected_mayor', { doctrine: doctrineName(win.doctrine) });
  return {
    day: world.day,
    candidates: candidates.map((x) => ({ id: x.c.id, name: x.c.name, doctrine: x.doctrine })),
    votes, ballots, winner: win.c.id, winnerName: win.c.name, doctrine: win.doctrine,
  };
}
