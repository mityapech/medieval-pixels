// Conversations: citizens who meet talk about what is on their minds, chosen from their memories, their
// present troubles and their hopes. Lines come from data/dialogue.json. Talk only reads the world and uses
// its own random stream, so it never changes what happens in the economy.
import dialogueJson from '../data/dialogue.json';
import { cheapestMeal, foodTarget, recipesOf } from './agent';
import type { GameData } from './data';
import { householdOf, isAdult, kinOf, livingMembers } from './family';
import { workingTool } from './production';
import type { Citizen, Conversation, Trade, World } from './types';
import { TRADES } from './types';

/** A topic has lines to say and replies by situation, or matched say/reply pairs for small talk. */
interface TopicDef { say?: string[]; reply?: Record<string, string[]>; pairs?: [string, string[]][] }
const DIALOGUE = dialogueJson as unknown as {
  greetings: Record<string, string[]>;
  topics: Record<string, TopicDef>;
  closers: string[];
};

// ---------- the talk random stream (mulberry32, like sim/rng.ts but on its own state) ----------

function talkRandom(world: World): number {
  let t = (world.talkRngState = (world.talkRngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickTalk = <T>(world: World, items: readonly T[]): T => items[Math.floor(talkRandom(world) * items.length)]!;

// ---------- words ----------

const WORK: Record<Trade, string> = { farmer: 'farming', baker: 'baking', laborer: 'labouring', blacksmith: 'smithing', merchant: 'trading' };
const WORKPLACE: Record<Trade, string> = {
  farmer: 'the fields', baker: 'the bakery', laborer: 'the woods and quarry', blacksmith: 'the smithy', merchant: "the merchants' row",
};
const first = (c: Citizen) => c.name.split(' ')[0]!;
const goodName = (data: GameData, g: string) => data.goods.get(g)!.name;

function fill(text: string, params: Record<string, string | number>): string {
  // Capitalise the start of every sentence, since a filled-in word may begin one.
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? k)).replace(/(^|[.!?]\s+)(\w)/g, (_, p: string, c: string) => p + c.toUpperCase());
}

// ---------- what is on someone's mind ----------

interface Candidate { topic: string; weight: number; params: Record<string, string | number> }

function purse(world: World, c: Citizen): number {
  return livingMembers(world, householdOf(world, c)).reduce((s, m) => s + m.coins, 0);
}

function comfortable(world: World, data: GameData, c: Citizen): boolean {
  const members = livingMembers(world, householdOf(world, c));
  return purse(world, c) > data.town.comfort.thresholdDays * members.length * cheapestMeal(data, c);
}

function struggling(world: World, data: GameData, c: Citizen): boolean {
  const members = livingMembers(world, householdOf(world, c));
  return purse(world, c) < data.town.reserveDays * members.length * cheapestMeal(data, c);
}

/** Average price paid over a week, `ago` days back. */
function weekPrice(world: World, good: string, ago: number): number | undefined {
  const days = world.reports.slice(Math.max(0, world.reports.length - ago - 7), world.reports.length - ago);
  let coins = 0;
  let qty = 0;
  for (const r of days) if (r.volume[good] && r.prices[good] !== undefined) { coins += r.prices[good]! * r.volume[good]!; qty += r.volume[good]!; }
  return qty ? coins / qty : undefined;
}

function onTheirMind(world: World, data: GameData, a: Citizen): Candidate[] {
  const out: Candidate[] = [];
  const add = (topic: string, weight: number, params: Record<string, string | number> = {}) => out.push({ topic, weight, params });
  const members = livingMembers(world, householdOf(world, a));

  // Present troubles.
  if (a.needs.daysHungry > 0) add('hungry', 10, { days: a.needs.daysHungry });
  if (a.needs.daysCold > 1) add('cold', 6, { days: a.needs.daysCold });
  if (struggling(world, data, a) && isAdult(data, a)) add('short_of_coin', 5, { mouths: members.length });
  for (const r of recipesOf(data, a)) {
    if (r.tool && !workingTool(a, r.tool)) { add('no_tool', 5, { tool: goodName(data, r.tool) }); break; }
  }
  // Prices that moved a lot in the last two weeks.
  for (const g of ['bread', 'vegetables', 'wood', 'wheat']) {
    const now = weekPrice(world, g, 0);
    const before = weekPrice(world, g, 14);
    if (now === undefined || before === undefined) continue;
    const p = { good: goodName(data, g), price: Math.round(now), goodId: g };
    if (now > before * 1.3) add('prices_up', 4, p);
    else if (now < before * 0.7) add('prices_down', 2, p);
  }
  // What is going on in town.
  for (const e of world.events) {
    if (DIALOGUE.topics[`event_${e.id}`]) add(`event_${e.id}`, 4, { family: e.family ?? 'neighbour' });
  }
  // Recent memories, fading over two weeks.
  for (const m of a.memories) {
    const age = world.day - m.day;
    if (age > 14 || !DIALOGUE.topics[m.kind]) continue;
    const params: Record<string, string | number> = { ...m.params };
    if (typeof params.from === 'string' && params.from in WORK) params.from = WORK[params.from as Trade];
    if (typeof params.tool === 'string' && data.goods.has(params.tool)) params.tool = goodName(data, params.tool);
    add(m.kind, 7 * (1 - age / 15), params);
  }
  // How the week went.
  if (a.trade && a.coinHistory.length >= 3) {
    const net = a.coins - a.coinHistory[0]!;
    const sells = Object.keys(a.prices)[0];
    if (net > 25 && sells) add('good_week', 2, { gain: net, good: goodName(data, sells) });
    if (net < -10) add('bad_week', 2, { loss: -net });
  }
  // Hopes.
  if (a.trade && a.coinHistory.length) {
    const net = (c: Citizen) => c.coins - (c.coinHistory[0] ?? c.coins);
    const avg = (t: Trade) => {
      const ws = world.citizens.filter((c) => c.alive && c.trade === t && c.coinHistory.length);
      return ws.length ? ws.reduce((s, c) => s + net(c), 0) / ws.length : -Infinity;
    };
    const best = TRADES.filter((t) => t !== a.trade).sort((x, y) => avg(y) - avg(x))[0]!;
    if (avg(best) > Math.max(net(a), 0) + 10) add('hope_trade', 2, { trade: WORK[best] });
  }
  const child = members.find((m) => m.age >= 10 && m.age < data.town.workingAge.adult);
  if (child && child !== a && isAdult(data, a)) add('hope_child', 2, { child: first(child) });
  if (comfortable(world, data, a) && isAdult(data, a)) add('hope_comfort', 2);
  add('small_talk', 0.5);
  return out;
}

// ---------- how the other person answers ----------

function replyKind(world: World, data: GameData, topic: string, params: Record<string, string | number>, a: Citizen, b: Citizen): string {
  const options = DIALOGUE.topics[topic]!.reply ?? {};
  const has = (k: string) => k in options;
  if (has('kin') && topic === 'lost_kin' && kinOf(world, b).some((k) => first(k.person) === params.name && !k.person.alive)) return 'kin';
  if (has('same') && ((topic === 'hungry' && b.needs.daysHungry > 0) || (topic === 'cold' && b.needs.daysCold > 0)
    || (topic === 'short_of_coin' && struggling(world, data, b)))) return 'same';
  if (has('comfortable') && comfortable(world, data, b) && b.householdId !== a.householdId) return 'comfortable';
  if (has('smith') && b.trade === 'blacksmith') return 'smith';
  if (has('seller') && typeof params.goodId === 'string' && b.prices[params.goodId] !== undefined) return 'seller';
  if (has('farmer') && b.trade === 'farmer') return 'farmer';
  if (has('laborer') && b.trade === 'laborer') return 'laborer';
  if (has('guard') && b.office === 'guard') return 'guard';
  if (has('same_trade') && (b.trade === params.to || WORK[b.trade as Trade] === params.trade)) return 'same_trade';
  if (has('envious') && struggling(world, data, b)) return 'envious';
  if (has('struggling') && struggling(world, data, b)) return 'struggling';
  return 'other';
}

function talk(world: World, data: GameData, a: Citizen, b: Citizen, setting: string, place: string, placeLabel: string): Conversation {
  const candidates = onTheirMind(world, data, a);
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = talkRandom(world) * total;
  let chosen = candidates[candidates.length - 1]!;
  for (const c of candidates) if ((roll -= c.weight) < 0) { chosen = c; break; }
  const def = DIALOGUE.topics[chosen.topic]!;
  const params = { ...chosen.params, listener: first(b), town: pickTalk(world, world.neighbours).name };
  const greeting = fill(pickTalk(world, DIALOGUE.greetings[setting] ?? ['']), params);
  let said: string;
  let reply: string;
  if (def.pairs) {
    const [say, replies] = pickTalk(world, def.pairs);
    said = fill(say, params);
    reply = fill(pickTalk(world, replies), { ...params, listener: first(a) });
  } else {
    said = fill(pickTalk(world, def.say!), params);
    const kind = replyKind(world, data, chosen.topic, chosen.params, a, b);
    reply = fill(pickTalk(world, def.reply![kind] ?? def.reply!.other ?? ['Aye.']), { ...params, listener: first(a) });
  }
  const lines = [{ speaker: a.id, text: greeting ? `${greeting} ${said}` : said }, { speaker: b.id, text: reply }];
  const closer = pickTalk(world, DIALOGUE.closers);
  if (closer) lines.push({ speaker: a.id, text: closer });
  return { day: world.day, place, placeLabel, topic: chosen.topic, participants: [a.id, b.id], lines };
}

// ---------- who meets whom today ----------

/** Today's conversations: at home, between kin, among workmates, at the market, and at church. */
export function converse(world: World, data: GameData): Conversation[] {
  const talkers = (c: Citizen) => c.alive && c.age >= 8;
  const out: Conversation[] = [];

  for (const h of world.households) {
    const m = livingMembers(world, h).filter(talkers);
    if (m.length < 2 || talkRandom(world) > 0.25) continue;
    const a = pickTalk(world, m);
    const b = pickTalk(world, m.filter((x) => x !== a));
    out.push(talk(world, data, a, b, 'household', `home:${h.id}`, `the ${h.family} house`));
  }

  const adults = world.citizens.filter((c) => c.alive && isAdult(data, c));
  for (let i = 0; i < 2 && adults.length; i++) {
    const a = pickTalk(world, adults);
    const kin = kinOf(world, a).map((k) => k.person).filter((k) => k.householdId !== a.householdId && talkers(k));
    if (!kin.length) continue;
    const h = householdOf(world, a);
    out.push(talk(world, data, a, pickTalk(world, kin), 'kin', `home:${h.id}`, `the ${h.family} house`));
  }

  for (let i = 0; i < 2; i++) {
    const t = pickTalk(world, TRADES);
    const ws = world.citizens.filter((c) => c.alive && c.trade === t);
    if (ws.length < 2) continue;
    const a = pickTalk(world, ws);
    out.push(talk(world, data, a, pickTalk(world, ws.filter((x) => x !== a)), 'workmate', `work:${t}`, WORKPLACE[t]));
  }

  const seen = new Set<string>();
  const meetings = world.meetings.filter(([x, y]) => x !== y && !seen.has(`${x}:${y}`) && seen.add(`${x}:${y}`));
  for (let i = 0; i < 4 && meetings.length; i++) {
    const [x, y] = meetings.splice(Math.floor(talkRandom(world) * meetings.length), 1)[0]!;
    const a = world.citizens[x]!;
    const b = world.citizens[y]!;
    if (talkers(a) && talkers(b)) out.push(talk(world, data, a, b, 'market', 'market', 'the market square'));
  }

  const priests = world.citizens.filter((c) => c.alive && c.office === 'priest');
  const helped = world.citizens.filter((c) => c.alive && c.memories.some((m) => m.kind === 'received_alms' && world.day - m.day < 3));
  if (priests.length && helped.length) {
    out.push(talk(world, data, pickTalk(world, helped), pickTalk(world, priests), 'church', 'church', 'the church'));
  }
  return out;
}
