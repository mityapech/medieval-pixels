// Town View: the bare-bones graphical town. Placeholder squares and labels on a tile map, people walking
// between home, work and the market through the day, conversations overheard when the observer is near,
// and click-to-inspect records. The simulation advances one day at midnight.
import { Application, Container, Graphics, Text } from 'pixi.js';
import spritesJson from '../../data/sprites.json';
import {
  cheapestMeal, talent, compact, upgradeTown, valueOf, workplaceOf, householdOf, kinOf, livingMembers, loadData, stockOf, tick, traceBatch, type Advert, type Citizen,
  type Conversation, type DayReport, type Doctrine,
} from '../../sim/index';
import { TILE, centre, layoutTown, spotIn, type Place } from './layout';
import { Life, type Mover, type Target } from './life';
import { doctrineName } from '../../sim/politics';
import { backdropTown, loadSettings, savedTown, showTitle, startPlaying, storeTown } from './title';
import { createLedger } from '../ledger/ledger';
import { DOCTRINE_COLOUR, renderHall } from './hall';
import { ElectionView, POLLS, speech, voteTime } from './election';
import { renderPowers } from './powers';

const data = loadData();
let settings = loadSettings();
// Playing your town, or showing the title screen over a timelapse of a copy of it (or a demo town).
const playing = startPlaying();
const saved = playing ? savedTown() : undefined;
const backdrop = saved ? undefined : backdropTown(data);
const world = saved?.world ?? backdrop!.world;
const townName = saved?.name ?? backdrop!.name;
upgradeTown(world, data);
const onTitle = !saved;
const places = layoutTown(world);
const life = new Life(world, data, places);
const MAP_W = world.land.width;
const MAP_H = world.land.height;

// ---------- time ----------

// One in-game day lasts settings.dayMinutes of real time at 1x (4 minutes by default; DESIGN.md section 3).
let DAY_MS = settings.dayMinutes * 60 * 1000;
// The title screen's timelapse runs fast; playing starts at the speed chosen in settings.
let speed = onTitle ? 30 : settings.startSpeed;
let clock = saved?.clock ?? 0.25; // fraction of the day; the town wakes at 06:00
const HEARING = 7 * TILE;

function phase(t: number): 'night' | 'morning' | 'work' | 'market' | 'evening' {
  if (t < 0.25) return 'night';
  if (t < 0.3) return 'morning';
  if (t < 0.55) return 'work';
  if (t < 0.75) return 'market';
  return 'evening';
}

// ---------- placeholder art: coloured squares with labels (sprites are looked up by name, none exist yet) ----------

const SPRITES = spritesJson as { places: Record<string, string>; people: Record<string, string> };
const PLACEHOLDER: Record<string, number> = {
  market: 0xcbb98f, church: 0x9c97ab, granary: 0xa77e48, fields: 0xc2a24a, woods: 0x7a5a2c,
  bakery: 0xb9733e, smithy: 0x5f5d58, merchants: 0xa98756, house: 0x8a6440, townhouse: 0x6e4a2e,
  quarry: 0x8f8a80, wildwood: 0x7d6a34, jetty: 0x6e4e2c, yard: 0xb39a6e, site: 0xc9b48a, tavern: 0x9a5b2e, school: 0xc7b26a, townhall: 0xb8955a, infirmary: 0xd8d0c4,
};
// Occupation colours: the same fixed order as the occupations chart on the stats page.
const JOB_COLOUR: Record<string, number> = {
  farmer: 0x2a78d6, baker: 0xeb6834, lumberjack: 0x1baf7a, miner: 0x7a6a5a, forager: 0x8cbf3f, fisherman: 0x3fb0c9,
  builder: 0xc9853f, innkeeper: 0xa0522d, teacher: 0x4a7fb5, healer: 0xd94f70, blacksmith: 0xeda100,
  merchant: 0xe87ba4, guard: 0x008300, priest: 0x6250d6, servant: 0xe34948, mayor: 0xd4af37,
};
const IDLE_COLOUR = 0xf0efec;

function spriteFor(name: string): { sprite: string; colour: number } {
  return { sprite: SPRITES.places[name] ?? name, colour: PLACEHOLDER[name] ?? 0xaaaaaa };
}

// ---------- scene ----------

const app = new Application();
await app.init({ resizeTo: window, background: '#8c8a4c', antialias: false, autoDensity: true, resolution: devicePixelRatio });
document.getElementById('map')!.append(app.canvas);

const scene = new Container();
app.stage.addChild(scene);
const ground = new Graphics();
const placeLayer = new Container();
const peopleLayer = new Container();
const tagLayer = new Container();
const bubbleLayer = new Container();
scene.addChild(ground, placeLayer, peopleLayer, tagLayer, bubbleLayer);

// The land, in an autumn palette: golden grass, red and orange woods, grey rock, the lake and canal, dirt roads,
// plank boardwalks and bridges inside the wall, docks on the lake, and the stone wall with its gates.
const TERRAIN_COLOUR = { grass: 0xa8a35a, water: 0x3f6f8f, forest: 0x6b5a2e, rock: 0x7d7b74 } as const;
const LEAVES = [0xc9662b, 0xd9952f, 0xa83a26, 0xb88a2c];
const tileAt = (i: number) => ({ x: (i % MAP_W) * TILE, y: Math.floor(i / MAP_W) * TILE });
world.land.terrain.forEach((t, i) => {
  const { x, y } = tileAt(i);
  const tx = x / TILE;
  const ty = y / TILE;
  const shade = t === 'grass' && (tx * 7 + ty * 13) % 5 === 0 ? 0x9e9a52 : TERRAIN_COLOUR[t];
  ground.rect(x, y, TILE, TILE).fill(shade);
  if (t === 'forest') {
    for (let k = 0; k < 2; k++) {
      ground.circle(x + 8 + ((tx * 5 + ty + k * 11) % 16), y + 9 + ((ty * 3 + tx + k * 7) % 14), 7 - k).fill(LEAVES[(tx + ty * 3 + k) % LEAVES.length]!);
    }
  }
  if (t === 'water' && (tx + ty * 2) % 4 === 0) ground.rect(x + 6, y + 14, 12, 2).fill({ color: 0xffffff, alpha: 0.15 });
});
const boardwalks = new Set(world.land.boardwalks);
for (const r of world.land.roads) {
  const { x, y } = tileAt(r);
  const onWater = world.land.terrain[r] === 'water';
  if (onWater || boardwalks.has(r)) {
    // Planks: a bridge over the water, a boardwalk inside the wall.
    ground.rect(x, y, TILE, TILE).fill(onWater ? 0x6e4e2c : 0x8c6a42);
    for (let k = 6; k < TILE; k += 8) ground.rect(x, y + k, TILE, 1.5).fill({ color: 0x3b2a18, alpha: 0.45 });
  } else {
    ground.rect(x, y, TILE, TILE).fill(0xb79a68);
  }
}
for (const d of world.land.docks) {
  const { x, y } = tileAt(d);
  ground.rect(x + 4, y, TILE - 8, TILE).fill(0x6e4e2c);
  for (let k = 4; k < TILE; k += 7) ground.rect(x + 4, y + k, TILE - 8, 1.5).fill({ color: 0x3b2a18, alpha: 0.5 });
}
for (const t of world.land.walls) {
  const { x, y } = tileAt(t);
  ground.rect(x, y, TILE, TILE).fill(0x6a675f).rect(x, y, TILE, TILE).stroke({ width: 1, color: 0x3d3b36, alpha: 0.8 });
  ground.rect(x + 3, y + 3, 10, 6).fill(0x7c7970).rect(x + 17, y + 13, 11, 6).fill(0x7c7970).rect(x + 5, y + 22, 12, 6).fill(0x7c7970);
}
for (const g of world.land.gates) {
  const { x, y } = tileAt(g);
  ground.rect(x, y, TILE, TILE).fill(0x6a675f).rect(x + 6, y + 4, TILE - 12, TILE - 4).fill(0x3a2a1a);
}
for (let x = 0; x <= MAP_W; x++) ground.rect(x * TILE, 0, 1, MAP_H * TILE).fill({ color: 0x000000, alpha: 0.04 });
for (let y = 0; y <= MAP_H; y++) ground.rect(0, y * TILE, MAP_W * TILE, 1).fill({ color: 0x000000, alpha: 0.04 });

/**
 * Map text uses a plain fixed font. The Mac system font is variable: canvas measures it at one weight and draws it
 * at another, so long labels lost their last letters.
 */
const MAP_FONT = 'Arial, Helvetica, sans-serif';

function label(text: string, size = 11, colour = 0x1a1a19): Text {
  return new Text({ text, style: { fontFamily: MAP_FONT, fontSize: size, fill: colour, fontWeight: 'bold', padding: 4 }, resolution: 3 });
}

/** Draws every building. Called again when the town changes (a new house going up, or finished). */
function drawPlaces(): void {
  placeLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
  for (const p of places.values()) {
    const { colour } = spriteFor(p.sprite);
    // Run-down buildings are drawn dimmer, with cracks; well-kept homes of the better-off get a tiled roof edge.
    const condition = world.buildings[p.key]?.condition ?? 80;
    const fade = condition < 40 ? 0.55 + condition / 100 : 1;
    const shade = (c: number) => (Math.round(((c >> 16) & 255) * fade) << 16) | (Math.round(((c >> 8) & 255) * fade) << 8) | Math.round((c & 255) * fade);
    const tier = world.property[p.key]?.tier;
    const g = new Graphics()
      .rect(p.x * TILE + 2, p.y * TILE + 2, p.w * TILE - 4, p.h * TILE - 4).fill(shade(colour))
      .rect(p.x * TILE + 2, p.y * TILE + 2, p.w * TILE - 4, p.h * TILE - 4).stroke({ width: tier === 3 ? 4 : 2, color: tier === 3 ? 0x7a2e1e : 0x3a3226, alpha: tier === 3 ? 0.9 : 0.5 });
    if (condition < 40) {
      for (let k = 0; k < Math.ceil((40 - condition) / 10); k++) {
        const cx = (p.x + 0.3 + ((k * 0.37) % 1) * (p.w - 0.6)) * TILE;
        const cy = (p.y + 0.5 + ((k * 0.61) % 1) * (p.h - 0.8)) * TILE;
        g.moveTo(cx, cy).lineTo(cx + 6, cy + 5).lineTo(cx + 3, cy + 11).stroke({ width: 1.5, color: 0x1a1a19, alpha: 0.6 });
      }
    }
    if (p.sprite === 'site') {
      // Scaffolding: crossed poles over the plot.
      for (let k = 0; k < p.w; k++) g.moveTo((p.x + k) * TILE + 4, p.y * TILE + 4).lineTo((p.x + k + 1) * TILE - 4, (p.y + p.h) * TILE - 4).stroke({ width: 2, color: 0x5a3f22 });
    }
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointertap', () => inspectPlace(p));
    const bright = ((colour >> 16) & 255) * 0.3 + ((colour >> 8) & 255) * 0.59 + (colour & 255) * 0.11;
    const t = label(p.label, p.sprite === 'house' || p.sprite === 'townhouse' || p.sprite === 'site' ? 9 : 12, bright < 120 ? 0xf3ead8 : 0x1a1a19);
    t.position.set(p.x * TILE + 6, p.y * TILE + 5);
    placeLayer.addChild(g, t);
  }
}
drawPlaces();

// People: small squares, coloured by occupation.
interface Walker extends Mover { g: Graphics; tag?: Text; lastStep?: number }
const walkers = new Map<number, Walker>();
/** Adds a walker for anyone not yet on the map (everyone at the start, then newborns). */
function addWalkers(): void {
  for (const c of world.citizens) {
    if (walkers.has(c.id)) continue;
    const home = centre(places.get(`home:${c.householdId}`) ?? places.get('market')!);
    const g = new Graphics();
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointertap', (e) => { e.stopPropagation(); inspectCitizen(c); });
    peopleLayer.addChild(g);
    walkers.set(c.id, { c, g, x: home.x, y: home.y });
  }
}
addWalkers();

/** What someone is doing, shown over their head when they are near the observer. */
function showTag(w: Walker, task: string | undefined): void {
  const near = settings.taskLabels && !onTitle && task && Math.hypot(w.x - observer.x, w.y - observer.y) <= HEARING;
  if (!near) { if (w.tag) w.tag.visible = false; return; }
  if (!w.tag) {
    w.tag = new Text({ text: '', style: { fontFamily: MAP_FONT, fontSize: 9, fill: 0xfcfaf2, stroke: { color: 0x1a1a19, width: 3, join: 'round' }, padding: 6 }, resolution: 3 });
    w.tag.anchor.set(0.5, 1);
    tagLayer.addChild(w.tag);
  }
  if (w.tag.text !== task) w.tag.text = task!;
  w.tag.visible = true;
  w.tag.position.set(w.x, w.y - 8);
}

// In development, expose the people on the page so movement can be checked from the browser console.
if (import.meta.env.DEV) (window as unknown as { townWalkers: typeof walkers }).townWalkers = walkers;

/** Finished goods floating up from a worker and fading, when they are near enough to see. */
interface Floater { t: Text; start: number; x: number; y: number }
let floaters: Floater[] = [];
function floatUp(w: Walker, text: string): void {
  if (Math.hypot(w.x - observer.x, w.y - observer.y) > HEARING * 2) return;
  const t = new Text({ text, style: { fontFamily: MAP_FONT, fontSize: 11, fontWeight: 'bold', fill: 0xffe08a, stroke: { color: 0x1a1a19, width: 3, join: 'round' }, padding: 6 }, resolution: 3 });
  t.anchor.set(0.5, 1);
  bubbleLayer.addChild(t);
  floaters.push({ t, start: performance.now(), x: w.x, y: w.y - 14 });
}
function animateFloaters(now: number): void {
  floaters = floaters.filter((f) => {
    const age = (now - f.start) / 1800;
    if (age >= 1) { f.t.destroy(); return false; }
    f.t.position.set(f.x, f.y - age * 26);
    f.t.alpha = 1 - age * age;
    return true;
  });
}

function drawWalker(w: Walker, progress?: number): void {
  const colour = w.c.office ? JOB_COLOUR[w.c.office]! : w.c.trade ? JOB_COLOUR[w.c.trade]! : IDLE_COLOUR;
  const size = w.c.age < data.town.workingAge.adult ? 7 : 10;
  w.g.clear();
  // Out on the water, people sit in a small boat.
  if (life.onWater(w.x, w.y)) w.g.roundRect(-11, -4, 22, 11, 5).fill(0x6e4e2c).stroke({ width: 1.5, color: 0x3b2a18 });
  w.g.rect(-size / 2, -size / 2, size, size).fill(colour).stroke({ width: 1.5, color: 0x1a1a19 });
  // Candidates carry a banner in their party's colour through the campaign and on election day.
  const party = candidateDoctrine.get(w.c.id);
  if (party) {
    w.g.rect(size / 2, -size / 2 - 13, 1.5, 13 + size / 2).fill(0x3b2a18);
    w.g.rect(size / 2 + 1.5, -size / 2 - 13, 10, 6).fill(DOCTRINE_COLOUR[party]).stroke({ width: 1, color: 0x1a1a19 });
  }
  // The mayor wears a gold chain of office and a little crown.
  if (w.c.office === 'mayor') {
    w.g.rect(-size / 2, -size / 2, size, size).stroke({ width: 2, color: 0xffd447 });
    w.g.poly([-5, -size / 2 - 3, -5, -size / 2 - 9, -2.5, -size / 2 - 6, 0, -size / 2 - 10, 2.5, -size / 2 - 6, 5, -size / 2 - 9, 5, -size / 2 - 3])
      .fill(0xffd447).stroke({ width: 1, color: 0x6b4f00 });
  }
  if (selected === w.c.id) w.g.rect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6).stroke({ width: 2, color: 0xffffff });
  if (progress !== undefined) {
    // Progress through the current step, in the worker's colour.
    w.g.roundRect(-10, size / 2 + 3, 20, 4, 2).fill({ color: 0x1a1a19, alpha: 0.7 });
    w.g.roundRect(-10, size / 2 + 3, Math.max(2, 20 * progress), 4, 2).fill(colour);
  }
  w.g.visible = w.c.alive;
  w.g.position.set(w.x, w.y);
}

// The observer stands in for the player until the player milestone: walk around and overhear people.
const observer = centre(places.get('market')!);
if (import.meta.env.DEV) (window as unknown as { townObserver: typeof observer }).townObserver = observer;
const observerG = new Graphics();
const hearingG = new Graphics().circle(0, 0, HEARING).fill({ color: 0xffffff, alpha: 0.07 }).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
peopleLayer.addChild(hearingG, observerG);
observerG.rect(-7, -7, 14, 14).fill(0xffffff).stroke({ width: 3, color: 0x0b0b0b });

// ---------- where people want to be ----------

interface Talk { c: Conversation; start: number; place: Place; shown: boolean; until: number }
let talks: Talk[] = [];
const WINDOW: Record<string, [number, number]> = { home: [0.78, 0.95], work: [0.3, 0.5], market: [0.58, 0.72], church: [0.5, 0.56] };

function placeFor(key: string): Place | undefined {
  return places.get(key);
}

/** Where someone is heading now: the place, and the point in it. */
function target(c: Citizen, t: number): Target {
  const homeKey = `home:${c.householdId}`;
  const home = placeFor(homeKey)!;
  const talking = talks.find((k) => k.c.participants.includes(c.id) && t >= k.start && t < k.start + 0.03);
  if (talking) return { dest: talking.place.key, ...spotIn(talking.place, c.id), mode: 'still', task: 'Talking' };
  const vote = politicsTarget(c, t);
  if (vote) return vote;
  const act = life.activity(c, t);
  if (act) return act;
  // Evening at the tavern for those who went tonight.
  if (c.today.tavern && t >= 0.76 && t < 0.88 && placeFor('work:innkeeper')) {
    return { dest: 'work:innkeeper', ...life.spot('work:innkeeper', c.id, world.day), mode: 'still', task: 'Drinking ale at the tavern' };
  }
  // Market time: heads of households come to shop; everyone else is at home.
  if (phase(t) === 'market' && householdOf(world, c).headId === c.id) {
    return { dest: 'market', ...life.spot('market', c.id, world.day), mode: 'still', task: 'Shopping at the market' };
  }
  return { dest: homeKey, ...spotIn(home, c.id), mode: 'still', task: phase(t) === 'night' ? 'Asleep' : 'At home' };
}

// ---------- days ----------

function scheduleTalks(conversations: Conversation[]): void {
  const perPlace = new Map<string, number>();
  talks = conversations.map((c) => {
    const kind = c.place.startsWith('home:') ? 'home' : c.place.startsWith('work:') ? 'work' : c.place;
    const [from, to] = WINDOW[kind] ?? [0.6, 0.7];
    const n = perPlace.get(kind) ?? 0;
    perPlace.set(kind, n + 1);
    return { c, start: from + ((n * 0.37) % 1) * (to - from), place: placeFor(c.place) ?? placeFor('market')!, shown: false, until: 0 };
  });
}

/** Midnight: the simulation runs the next day, then the town view sets it up to be watched. */
function newDay(): void {
  const before = world.land.places.map((p) => `${p.key}|${p.label}`).join();
  const report = tick(world, data);
  startDay(report, before);
  // Your town is kept small and saved every day (never the title screen's timelapse).
  if (!onTitle) { compact(world); save(); }
  if (ledger && !ledgerPanel.hidden) ledger.refresh(world, townName);
  if (!hallPanel.hidden) refreshHall();
}

/** Sets up a day to watch: buildings, newcomers, plans, conversations, adverts and the news. */
function startDay(report: DayReport, before = ''): void {
  // The town changed: houses started or finished, children born.
  if (world.land.places.map((p) => `${p.key}|${p.label}`).join() !== before) {
    places.clear();
    for (const [k, p] of layoutTown(world)) places.set(k, p);
  }
  // Redrawn every day: buildings show their condition as they wear down or are repaired.
  drawPlaces();
  addWalkers();
  life.newDay();
  scheduleTalks(report.conversations);
  scheduleAdverts(report);
  startPolitics(report);
  postNews(report);
  refreshMoney();
  if (selected !== null) inspectCitizen(world.citizens[selected]!);
}

// ---------- merchants' adverts: cried in the market, posted on the notice board ----------

interface Cry { a: Advert; start: number; shown: boolean }
let cries: Cry[] = [];

function scheduleAdverts(r: DayReport): void {
  // Each merchant cries their wares a few times through the market hours.
  cries = r.adverts.flatMap((a, i) => [0, 1, 2].map((k) => ({ a, start: 0.56 + ((i * 0.031 + k * 0.061) % 0.18), shown: false })));
  const board = document.getElementById('notices')!;
  board.replaceChildren();
  if (!r.adverts.length) {
    const li = document.createElement('li');
    li.textContent = 'No merchant has anything to cry today.';
    board.append(li);
  }
  for (const a of r.adverts) {
    const li = document.createElement('li');
    const where = document.createElement('div');
    where.className = 'where';
    where.textContent = `${a.name}, ${a.speciality}`;
    const text = document.createElement('div');
    text.textContent = `"${a.text}"`;
    const stock = document.createElement('div');
    stock.className = 'muted';
    stock.textContent = a.goods.map((g) => `${g.qty} ${data.goods.get(g.good)!.name} at ${g.price}${g.origin ? ` (from ${g.origin})` : ''}`).join(' · ');
    li.append(where, text, stock);
    board.append(li);
  }
}

function cryWares(): void {
  for (const k of cries) {
    if (k.shown || clock < k.start) continue;
    k.shown = true;
    const w = walkers.get(k.a.merchant);
    if (!w || Math.hypot(w.x - observer.x, w.y - observer.y) > HEARING) continue;
    say(w.c, k.a.text, 0);
  }
}

// ---------- speech bubbles and the overheard log ----------

interface Bubble { box: Container; until: number; speaker: number }
let bubbles: Bubble[] = [];
const LINE_MS = 3200;

function say(speaker: Citizen, text: string, delay: number): void {
  const box = new Container();
  const t = new Text({ text, style: { fontFamily: MAP_FONT, fontSize: 11, fill: 0x0b0b0b, wordWrap: true, wordWrapWidth: 200, padding: 4 }, resolution: 3 });
  const bg = new Graphics().roundRect(-6, -5, t.width + 12, t.height + 10, 6).fill(0xfcfcfb).stroke({ width: 1, color: 0x0b0b0b, alpha: 0.4 });
  box.addChild(bg, t);
  box.visible = false;
  bubbleLayer.addChild(box);
  const start = performance.now() + delay;
  bubbles.push({ box, until: start + LINE_MS, speaker: speaker.id });
  setTimeout(() => { box.visible = true; }, delay);
}

function overhear(k: Talk): void {
  const log = document.getElementById('log')!;
  const li = document.createElement('li');
  const where = document.createElement('div');
  where.className = 'where';
  where.textContent = `Day ${k.c.day}, at ${k.c.placeLabel}`;
  li.append(where);
  k.c.lines.forEach((line, i) => {
    const speaker = world.citizens[line.speaker]!;
    const row = document.createElement('div');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${speaker.name}: `;
    row.append(who, document.createTextNode(line.text));
    li.append(row);
    say(speaker, line.text, i * LINE_MS);
  });
  log.prepend(li);
  while (log.children.length > 40) log.lastElementChild!.remove();
}

// ---------- politics on the map: campaign speeches at the market, election day ----------

let campaign: DayReport['campaign'];
let election: DayReport['election'];
let electionView: ElectionView | undefined;
const candidateDoctrine = new Map<number, Doctrine>();
let nextSpeech = 0;
let speeches = 0;
const electionEl = document.getElementById('election')!;

/** Where a candidate stands at the market: in a row along its top edge. */
function stump(i: number, n: number): { x: number; y: number } {
  const m = placeFor('market')!;
  return { x: (m.x + ((i + 1) / (n + 1)) * m.w) * TILE, y: (m.y + 0.6) * TILE };
}

function startPolitics(r: DayReport): void {
  election = r.election;
  campaign = election ? undefined : r.campaign;
  candidateDoctrine.clear();
  for (const c of (election ?? campaign)?.candidates ?? []) candidateDoctrine.set(c.id, c.doctrine);
  electionView?.hide();
  electionView = undefined;
  if (!election || onTitle) return;
  // At 60x the whole day passes in seconds: slow down to watch the vote.
  const slowed = speed > 10;
  if (slowed) setSpeed(10);
  electionView = new ElectionView(electionEl, election, r.day, townName, slowed);
  if (clock >= POLLS.announce) { electionView.countRest(nameOf); electionView.announce(); }
}
const nameOf = (id: number) => world.citizens[id]!.name;

/** Candidates at the market in campaign hours and on election day; voters walking in to cast their ballots. */
function politicsTarget(c: Citizen, t: number): Target | undefined {
  if (!placeFor('market')) return undefined;
  const cands = (election ?? campaign)?.candidates ?? [];
  const i = cands.findIndex((x) => x.id === c.id);
  if (i >= 0) {
    const [from, to] = election ? [POLLS.open - 0.03, POLLS.closeOverlay - 0.06] : [0.56, 0.72];
    if (t >= from && t < to) {
      const task = !election ? `Campaigning: ${doctrineName(cands[i]!.doctrine)}` : t >= POLLS.announce ? (c.id === election.winner ? 'Elected mayor!' : 'Lost the election') : 'Awaiting the vote';
      return { dest: 'market', ...stump(i, cands.length), mode: 'still', task };
    }
  }
  if (election && election.ballots[c.id] !== undefined) {
    const at = voteTime(c.id);
    if (t >= at && t < at + 0.04) return { dest: 'market', ...life.spot('market', c.id, world.day + 7), mode: 'still', task: 'Casting a vote' };
  }
  return undefined;
}

function updatePolitics(now: number): void {
  // Campaign speeches: the candidates take turns at the market.
  if (campaign && clock >= 0.58 && clock < 0.72 && now >= nextSpeech) {
    const c = campaign.candidates[speeches % campaign.candidates.length]!;
    const w = walkers.get(c.id);
    if (w?.settledAt === 'market') {
      say(w.c, speech(c.doctrine, Math.floor(speeches / campaign.candidates.length) + world.day), 0);
      nextSpeech = now + LINE_MS * 1.2;
    }
    speeches++;
  }
  if (!election || !electionView) return;
  // A ballot is counted when its voter reaches the market (or their time has passed, if they never got there).
  for (const key of Object.keys(election.ballots)) {
    const v = Number(key);
    const at = voteTime(v);
    if (clock < at) continue;
    const w = walkers.get(v);
    if (clock < at + 0.04 && w?.settledAt !== 'market') continue;
    const cand = electionView.cast(v, nameOf(v));
    const cw = cand !== undefined ? walkers.get(cand) : undefined;
    if (cw) floatUp(cw, '+1 vote');
  }
  electionView.update(clock);
  if (!electionView.announced && clock >= POLLS.announce) {
    electionView.countRest(nameOf);
    electionView.announce();
    celebrate(now);
    refreshMoney();
  }
  if (clock >= POLLS.closeOverlay) { electionView.hide(); electionView = undefined; }
}

// Confetti over the winner.
interface Confetto { g: Graphics; x: number; y: number; vx: number; vy: number; spin: number; born: number }
let confetti: Confetto[] = [];
function celebrate(now: number): void {
  const e = election!;
  const party = candidateDoctrine.get(e.winner)!;
  const w = walkers.get(e.winner);
  const at = w ?? centre(placeFor('market')!);
  const colours = [Number.parseInt(DOCTRINE_COLOUR[party].slice(1), 16), 0xffd447, 0xffffff];
  for (let i = 0; i < 90; i++) {
    const g = new Graphics().rect(-2, -1.5, 4, 3).fill(colours[i % 3]!);
    bubbleLayer.addChild(g);
    confetti.push({ g, x: at.x, y: at.y - 10, vx: (Math.random() - 0.5) * 0.22, vy: -0.12 - Math.random() * 0.22, spin: (Math.random() - 0.5) * 0.03, born: now });
  }
  say(world.citizens[e.winner]!, `Thank you, ${townName || 'friends'}! ${speech(party, 0)}`, 0);
  for (const c of e.candidates) if (c.id !== e.winner) say(world.citizens[c.id]!, 'The town has spoken. Congratulations.', LINE_MS);
}
function animateConfetti(now: number, dt: number): void {
  confetti = confetti.filter((p) => {
    const age = now - p.born;
    if (age > 4000) { p.g.destroy(); return false; }
    p.vy += 0.0005 * dt;
    p.vx *= 0.995;
    p.x += p.vx * dt;
    p.y += Math.min(p.vy, 0.06) * dt;
    p.g.position.set(p.x, p.y);
    p.g.rotation += p.spin * dt;
    p.g.alpha = age > 2500 ? 1 - (age - 2500) / 1500 : 1;
    return true;
  });
}

// ---------- the frame loop ----------

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, textarea')) return;
  keys.add(e.key.toLowerCase());
  if (e.key === '+' || e.key === '=') setZoom(zoom + 1);
  if (e.key === '-' || e.key === '_') setZoom(zoom - 1);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

let zoom = innerWidth >= 1600 ? 2 : 1;
function setZoom(z: number): void {
  zoom = Math.min(3, Math.max(1, z)); // integer zoom keeps pixels sharp
}

app.ticker.add((t) => {
  // Real elapsed time (Pixi's deltaMS is capped at low frame rates, which would slow the in-game clock).
  const dt = Math.min(t.elapsedMS, 1000);
  // Time of day, and a new day at midnight.
  clock += (dt / DAY_MS) * speed;
  if (clock >= 1) { clock -= 1; newDay(); }

  // On the title screen the camera drifts slowly around the town instead.
  if (onTitle) {
    const m = centre(places.get('market')!);
    const a = performance.now() / 40000;
    observer.x = m.x + Math.cos(a) * MAP_W * TILE * 0.18;
    observer.y = m.y + Math.sin(a * 0.8) * MAP_H * TILE * 0.14;
  }
  // Observer walks at the same speed whatever the game speed.
  const step = onTitle ? 0 : 0.25 * dt;
  if (keys.has('w') || keys.has('arrowup')) observer.y -= step;
  if (keys.has('s') || keys.has('arrowdown')) observer.y += step;
  if (keys.has('a') || keys.has('arrowleft')) observer.x -= step;
  if (keys.has('d') || keys.has('arrowright')) observer.x += step;
  observer.x = Math.min(MAP_W * TILE, Math.max(0, observer.x));
  observer.y = Math.min(MAP_H * TILE, Math.max(0, observer.y));
  observerG.position.set(observer.x, observer.y);
  hearingG.position.set(observer.x, observer.y);

  // Everyone moves a step towards where they want to be (see Life.move).
  const now = performance.now();
  const living = [...walkers.values()].filter((w) => {
    if (!w.c.alive) { w.g.visible = false; if (w.tag) w.tag.visible = false; }
    return w.c.alive;
  });
  life.move(living.map((w) => ({ m: w, to: target(w.c, clock) })), now, dt, speed);

  // Draw everyone; show task labels for those near the observer, nearest first, skipping any that would overlap.
  const shownTags: { x: number; y: number; w: number }[] = [];
  const byNearness = [...walkers.values()].sort((a, b) => Math.hypot(a.x - observer.x, a.y - observer.y) - Math.hypot(b.x - observer.x, b.y - observer.y));
  for (const w of byNearness) {
    const to = w.c.alive ? target(w.c, clock) : undefined;
    // A progress bar while someone is at work on a step (not while walking there).
    const working = settings.taskLabels && to?.progress !== undefined && w.settledAt === to.dest && to.task !== 'At home' ? to.progress : undefined;
    drawWalker(w, working);
    if (!w.c.alive || !to) continue;
    // A job finished: what it made rises from the worker.
    // (Follows the work schedule, not the moment: stopping for a chat does not end the day's work.)
    const sched = life.activity(w.c, clock);
    if (sched?.step !== undefined || w.lastStep !== undefined) {
      const now = sched?.step ?? Number.POSITIVE_INFINITY;
      if (w.lastStep !== undefined && now > w.lastStep) {
        for (const made of life.finishedBetween(w.c, w.lastStep, now)) floatUp(w, `+${made.qty} ${data.goods.get(made.good)?.name ?? made.good}`);
      }
      w.lastStep = sched?.step;
    }
    // Being at home or asleep needs no label.
    const doing = to.task;
    const task = doing === 'At home' || doing === 'Asleep' ? undefined : doing;
    const width = (task?.length ?? 0) * 5;
    const clash = shownTags.some((t) => Math.abs(t.y - w.y) < 12 && Math.abs(t.x - w.x) < (t.w + width) / 2 + 4);
    showTag(w, clash ? undefined : task);
    if (!clash && w.tag?.visible) shownTags.push({ x: w.x, y: w.y, w: width });
  }

  cryWares();
  updatePolitics(now);
  animateFloaters(now);
  animateConfetti(now, dt);

  // Conversations start at their time; only those within hearing of the observer are shown.
  for (const k of talks) {
    if (k.shown || clock < k.start) continue;
    k.shown = true;
    const at = centre(k.place);
    if (Math.hypot(at.x - observer.x, at.y - observer.y) <= HEARING + Math.max(k.place.w, k.place.h) * TILE / 2) overhear(k);
  }
    bubbles = bubbles.filter((b) => {
    if (now > b.until) { b.box.destroy({ children: true }); return false; }
    const w = walkers.get(b.speaker)!;
    b.box.position.set(w.x - b.box.width / 2 + 6, w.y - b.box.height - 8);
    return true;
  });

  // Camera follows the observer.
  scene.scale.set(zoom);
  scene.position.set(Math.round(app.screen.width / 2 - observer.x * zoom), Math.round(app.screen.height / 2 - observer.y * zoom));
  updateClock();
});

// ---------- HUD ----------

function updateClock(): void {
  const minutes = Math.floor(clock * 24 * 60);
  document.getElementById('day')!.textContent = `Day ${world.day}`;
  document.getElementById('time')!.textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  document.getElementById('phase')!.textContent = { night: 'night', morning: 'morning', work: 'at work', market: 'market hours', evening: 'evening' }[phase(clock)];
}

function setSpeed(s: number): void {
  speed = s;
  document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s)));
}
document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
setSpeed(speed);

function refreshMoney(): void {
  const r = world.reports.at(-1);
  const dl = document.getElementById('money')!;
  const rows: [string, string][] = r
    ? [
        ['Standing', `${r.fortune.level} (${r.fortune.score})`],
        ['Mayor', r.election && clock < POLLS.announce ? 'chosen today' : r.mayor ? `${r.mayor.name}, ${doctrineName(r.mayor.doctrine)}` : 'none yet'],
        ['Bread', r.prices.bread !== undefined ? `${r.prices.bread.toFixed(1)} coins` : '–'],
        ['Vegetables', r.prices.vegetables !== undefined ? `${r.prices.vegetables.toFixed(1)} coins` : '–'],
        ['Wood', r.prices.wood !== undefined ? `${r.prices.wood.toFixed(1)} coins` : '–'],
        ['People', `${r.alive}`],
        ['Coins in town', r.townCoins.toLocaleString()],
        ['Treasury', `${r.treasury}`],
        ['Church', `${r.church}`],
        ['Granary', `${r.granary} units`],
        ['Unemployed', `${r.unemployed}`],
      ]
    : [['People', `${world.citizens.length}`]];
  dl.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    return [dt, dd];
  }));
  document.getElementById('events')!.textContent = world.events.length ? `Now: ${world.events.map((e) => e.name).join(', ')}` : '';
}

// ---------- controls: step a day, start a new town ----------

document.getElementById('step')!.addEventListener('click', () => {
  // Finish today's remaining conversations unheard and jump to the next morning.
  newDay();
  clock = 0.25;
});
document.getElementById('menu')!.addEventListener('click', () => {
  save();
  const before = speed;
  setSpeed(0);
  showTitle(data, {
    onResume: () => setSpeed(before),
    onSettings: (next) => { settings = next; DAY_MS = settings.dayMinutes * 60 * 1000; },
  });
});

// The Town Hall: the mayor, the policy in force and what is changing, refreshed each day while it is open.
const hallPanel = document.getElementById('hall-panel')!;
function refreshHall(): void {
  renderHall(document.getElementById('hall-body')!, world, data, townName, (id) => { hallPanel.hidden = true; inspectCitizen(world.citizens[id]!); });
}
document.getElementById('hall')!.addEventListener('click', () => {
  hallPanel.hidden = !hallPanel.hidden;
  if (!hallPanel.hidden) { panel.hidden = true; refreshHall(); }
});
document.getElementById('hall-close')!.addEventListener('click', () => { hallPanel.hidden = true; });

// The Ledger: charts of this town's own history, refreshed each day while it is open.
const ledgerPanel = document.getElementById('ledger-panel')!;
let ledger: ReturnType<typeof createLedger> | undefined;
document.getElementById('ledger')!.addEventListener('click', () => {
  ledger ??= createLedger(ledgerPanel, () => { ledgerPanel.hidden = true; });
  ledgerPanel.hidden = false;
  ledger.refresh(world, townName);
});

// ---------- town news: deaths, work, families, events, trade ----------

function postNews(r: DayReport): void {
  const items: string[] = [];
  for (const e of r.eventsStarted) items.push(`Event: ${e}`);
  for (const s of r.starved) items.push(`${s.name} starved`);
  if (r.election) {
    const tally = r.election.candidates.map((c) => `${c.name} (${doctrineName(c.doctrine)}) ${r.election!.votes[c.id] ?? 0}`).join(', ');
    items.push(`Election results: ${tally}`);
  }
  if (r.campaign && !r.election && world.reports.at(-2)?.campaign === undefined) {
    items.push(`The campaign for mayor has begun: ${r.campaign.candidates.map((c) => `${c.name} (${doctrineName(c.doctrine)})`).join(', ')}. The town votes on day ${r.campaign.electionDay}.`);
  }
  for (const sale of r.propertySales) items.push(sale);
  for (const j of r.jobChanges) {
    items.push(!j.from ? `${j.name} started work as a ${j.to}` : !j.to ? `${j.name} stopped working as a ${j.from}` : `${j.name} left ${j.from} work to become a ${j.to}`);
  }
  items.push(...r.familyEvents);
  if (r.imports || r.exports) items.push(`Trade abroad: ${r.imports} coins of imports, ${r.exports} of exports`);
  if (r.flows.churchAlms) items.push(`The church gave ${r.flows.churchAlms} coins in alms`);
  const news = document.getElementById('news')!;
  const li = document.createElement('li');
  const where = document.createElement('div');
  where.className = 'where';
  where.textContent = `Day ${r.day}`;
  li.append(where);
  for (const text of items.length ? items : ['A quiet day.']) {
    const row = document.createElement('div');
    row.textContent = text;
    li.append(row);
  }
  news.prepend(li);
  while (news.children.length > 60) news.lastElementChild!.remove();
}

function showTab(which: 'log' | 'news' | 'notices'): void {
  for (const id of ['log', 'news', 'notices'] as const) {
    document.getElementById(id)!.hidden = which !== id;
    document.getElementById(`tab-${id}`)!.setAttribute('aria-selected', String(which === id));
  }
}
document.getElementById('tab-log')!.addEventListener('click', () => showTab('log'));
document.getElementById('tab-news')!.addEventListener('click', () => showTab('news'));
document.getElementById('tab-notices')!.addEventListener('click', () => showTab('notices'));

// ---------- inspector ----------

let selected: number | null = null;
const panel = document.getElementById('inspector')!;
const body = document.getElementById('inspect')!;
document.getElementById('close')!.addEventListener('click', () => { panel.hidden = true; selected = null; });

function h(tag: string, text?: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function facts(pairs: [string, string][]): HTMLElement {
  const dl = h('dl', undefined, 'facts');
  for (const [k, v] of pairs) dl.append(h('dt', k), h('dd', v));
  return dl;
}

function personLink(c: Citizen, note = ''): HTMLElement {
  const li = h('li');
  const b = h('button', c.name, 'person-link');
  b.addEventListener('click', () => inspectCitizen(c));
  li.append(b, document.createTextNode(`${note}${c.alive ? '' : ' (died)'}`));
  return li;
}

const MEMORY: Record<string, (p: Record<string, string | number>) => string> = {
  changed_job: (p) => `left ${p.from} work to become a ${p.to}`,
  started_work: (p) => `started work as a ${p.to}`,
  entered_service: (p) => `went into service with the ${p.family} household`,
  took_post: (p) => `was taken on as a ${p.office}`,
  let_go: (p) => `was let go by the ${p.family} household`,
  lost_kin: (p) => `lost their ${p.relation} ${p.name}`,
  received_alms: (p) => `received alms from ${p.giver}`,
  gave_alms: (p) => `gave alms to the ${p.family} household`,
  helped_by_kin: (p) => `was helped by their ${p.relation} ${p.name}`,
  moved_in: (p) => `moved in with ${p.name}`,
  tool_broke: (p) => `broke their ${p.tool}`,
};

function inspectCitizen(c: Citizen): void {
  selected = c.id;
  const hh = householdOf(world, c);
  const members = livingMembers(world, hh);
  const purse = members.reduce((s, m) => s + m.coins, 0);
  const job = c.office ? `${c.office}${c.office === 'servant' && c.employerHousehold !== null ? ` to the ${world.households[c.employerHousehold]!.family} household` : ''}`
    : c.trade ?? (c.age < data.town.workingAge.adult ? 'child' : c.age >= data.town.workingAge.elder ? 'elder' : 'at home');
  const worries: string[] = [];
  if (c.needs.daysHungry) worries.push(`hungry for ${c.needs.daysHungry} day(s)`);
  if (c.needs.daysCold) worries.push(`no fire for ${c.needs.daysCold} night(s)`);
  if (purse < data.town.reserveDays * members.length * cheapestMeal(data, c)) worries.push('the household is short of coins');
  const goods = c.inventory.reduce<Record<string, number>>((m, l) => ({ ...m, [l.good]: (m[l.good] ?? 0) + l.qty }), {});
  body.replaceChildren(
    h('h3', c.name),
    facts([
      ['Age', `${c.age}`],
      ['Work', c.office === 'mayor' && world.mayor?.id === c.id ? `Mayor of ${townName || 'the town'} (${doctrineName(world.mayor.doctrine)}), at the Town Hall` : job],
      ['Traits', c.traits.map((id) => {
        const gifts = Object.entries(data.traits.get(id)?.talent ?? {}).filter(([, m]) => m > 1).map(([t]) => t);
        return gifts.length ? `${id} (gifted ${gifts.join(', ')})` : id;
      }).join('; ')],
      ...(c.trade ? [['At their work', fit(talent(data, c, c.trade))] as [string, string]] : []),
      ['Household', `${hh.family} (${members.length} living)${hh.headId === c.id ? ', head' : ''}`],
      ['Coins', `${c.coins} (household ${purse})`],
      ['Worries', worries.join('; ') || 'none pressing'],
      ['Now', target(c, clock).task ?? '–'],
    ]),
    renderPowers(world, data, c, (text) => miracle(text, c)),
  );
  const plan = life.planOf(c);
  if (plan.length) {
    body.append(h('h4', "Today's work"));
    const ol = h('ol');
    for (const step of plan) ol.append(h('li', step.task));
    body.append(ol);
  }
  const holdings = propertyOf(c);
  if (holdings) body.append(holdings);
  const kin = kinOf(world, c);
  const dead = world.citizens.filter((k) => !k.alive && (k.id === c.spouseId || c.parentIds.includes(k.id) || k.parentIds.includes(c.id)));
  if (kin.length || dead.length) {
    body.append(h('h4', 'Family'));
    const ul = h('ul');
    for (const k of kin.slice(0, 10)) ul.append(personLink(k.person, ` — ${k.relation}`));
    for (const k of dead) ul.append(personLink(k));
    body.append(ul);
  }
  const owned = Object.entries(goods);
  if (owned.length) {
    body.append(h('h4', 'Holds (click to trace where it came from)'));
    const ul = h('ul');
    for (const [g, q] of owned) {
      const li = h('li');
      const b = h('button', `${q} ${data.goods.get(g)!.name}`, 'person-link');
      const trace = h('ol', undefined, 'trace');
      trace.hidden = true;
      b.addEventListener('click', () => {
        trace.hidden = !trace.hidden;
        if (trace.hidden || trace.childElementCount) return;
        const lot = c.inventory.find((l) => l.good === g)!;
        for (const step of traceBatch(world, lot.batch).slice(0, 12)) {
          const row = h('li', `${step.batch.qty} ${data.goods.get(step.batch.good)!.name}: ${step.makerName}, day ${step.batch.day}`);
          row.style.setProperty('--depth', String(step.depth));
          trace.append(row);
        }
      });
      li.append(b, trace);
      ul.append(li);
    }
    body.append(ul);
  }
  if (c.memories.length) {
    body.append(h('h4', 'Remembers'));
    const ul = h('ul');
    for (const m of [...c.memories].reverse().slice(0, 8)) ul.append(h('li', `Day ${m.day}: ${(MEMORY[m.kind] ?? (() => m.kind))(m.params)}`));
    body.append(ul);
  }
  const said = world.conversations.filter((k) => k.participants.includes(c.id)).slice(-3).reverse();
  if (said.length) {
    body.append(h('h4', 'Recently said'));
    const ul = h('ul');
    for (const k of said) {
      const line = k.lines.find((l) => l.speaker === c.id);
      if (line) ul.append(h('li', `Day ${k.day}, ${k.placeLabel}: "${line.text}"`));
    }
    body.append(ul);
  }
  panel.hidden = false;
}

/**
 * What someone owns: each building or site, who lives or works there, and what it brings in a day (rent and site
 * fees, averaged over the last few days of payments), with what it is worth. Undefined for those who own nothing.
 */
function propertyOf(c: Citizen): HTMLElement | undefined {
  const owned = Object.entries(world.property).filter(([, p]) => p.owner === c.id);
  if (!owned.length) return undefined;
  const days = Math.max(1, Math.min(3, world.day));
  const recent = world.ledger.filter((e) => e.to === c.key && world.day - e.day < days);
  const label = (key: string) => world.land.places.find((p) => p.key === key)?.label ?? key;
  const rows = owned.map(([key, p]) => {
    let memo: (m: string) => boolean;
    let who: string;
    if (key.startsWith('home:')) {
      const hh = world.households[Number(key.slice(5))];
      const living = hh ? livingMembers(world, hh) : [];
      memo = (m) => !!hh && m === `rent for the ${hh.family} house`;
      who = !living.length ? 'standing empty' : living.some((m) => m.id === c.id) ? 'their own home' : `let to the ${hh!.family} family at ${p.rent} a day`;
    } else {
      const workers = world.citizens.filter((x) => x.alive && workplaceOf(x) === key && x.id !== c.id);
      memo = (m) => m === `site fee at ${key}`;
      who = workers.length ? `${workers.length} at work here` : 'nobody working here';
    }
    const perDay = Math.round(recent.filter((e) => memo(e.memo)).reduce((s, e) => s + e.amount, 0) / days);
    return { name: label(key), who, perDay, worth: valueOf(world, data, key) };
  }).sort((a, b) => b.perDay - a.perDay || b.worth - a.worth);
  const total = rows.reduce((s, r) => s + r.perDay, 0);
  const worth = rows.reduce((s, r) => s + r.worth, 0);
  const box = h('div', undefined, 'holdings');
  box.append(h('h4', `Property: ${rows.length} held, about ${total} coins a day, worth about ${worth}`));
  const table = h('table');
  for (const r of rows) {
    const tr = h('tr');
    const name = h('td');
    name.append(h('b', r.name), h('div', r.who, 'muted'));
    tr.append(name, h('td', r.perDay ? `+${r.perDay}/day` : '–', r.perDay ? 'change-up' : 'muted'), h('td', `≈${r.worth}`, 'muted'));
    table.append(tr);
  }
  box.append(table);
  return box;
}

/** How well someone suits their trade, from their traits. */
function fit(m: number): string {
  return m >= 1.5 ? `a natural (+${Math.round((m - 1) * 100)}%)` : m > 1 ? `gifted (+${Math.round((m - 1) * 100)}%)` : m < 1 ? `poorly suited (${Math.round((m - 1) * 100)}%)` : 'ordinary';
}

/** The player used a power: it goes in the town news, and the town is redrawn (names and homes may have changed). */
function miracle(text: string, c: Citizen): void {
  const news = document.getElementById('news')!;
  const li = h('li', undefined, 'miracle');
  li.append(h('div', `Day ${world.day}, by your hand`, 'where'), h('div', `✦ ${text}`));
  news.prepend(li);
  showTab('news');
  places.clear();
  for (const [k, p] of layoutTown(world)) places.set(k, p);
  drawPlaces();
  refreshMoney();
  if (!hallPanel.hidden) refreshHall();
  inspectCitizen(c);
  if (!onTitle) save();
}

/** Everyone in town, filterable by name or work; click a name to inspect them. */
function showPeople(): void {
  selected = null;
  const filter = document.createElement('input');
  filter.className = 'people-filter';
  filter.placeholder = 'Filter by name or work';
  filter.setAttribute('aria-label', 'Filter people');
  const ul = h('ul');
  const render = () => {
    const q = filter.value.trim().toLowerCase();
    const work = (c: Citizen) => c.office ?? c.trade ?? (c.age < data.town.workingAge.adult ? 'child' : c.age >= data.town.workingAge.elder ? 'elder' : 'at home');
    ul.replaceChildren(...world.citizens
      .filter((c) => !q || c.name.toLowerCase().includes(q) || work(c).includes(q))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name))
      .map((c) => personLink(c, ` — ${work(c)}, ${c.age}, ${c.coins} coins`)));
  };
  filter.addEventListener('input', render);
  render();
  body.replaceChildren(h('h3', `People (${world.citizens.filter((c) => c.alive).length} living)`), filter, ul);
  panel.hidden = false;
  filter.focus();
}
document.getElementById('people')!.addEventListener('click', showPeople);

function inspectPlace(p: Place): void {
  if (p.key === 'townhall' && !onTitle) { panel.hidden = true; hallPanel.hidden = false; refreshHall(); return; }
  selected = null;
  const r = world.reports.at(-1);
  body.replaceChildren(h('h3', p.label));
  // Who owns it, what it earns, its condition, and every time it has changed hands.
  const prop = world.property[p.key];
  if (prop) {
    const owner = prop.owner === null ? 'the town' : world.citizens[prop.owner]!.name;
    const rows: [string, string][] = [['Owner', owner]];
    if (prop.niche) rows.push(['Known for', prop.niche]);
    if (prop.kind === 'home') rows.push(['Rent', prop.rent ? `${prop.rent} coins a day${prop.arrears ? ` (${prop.arrears} owed)` : ''}` : 'owner lives here']);
    const cond = world.buildings[p.key]?.condition;
    if (cond !== undefined) rows.push(['Condition', `${Math.round(cond)}%${cond < 40 ? ' (run down)' : cond > 85 ? ' (well kept)' : ''}`]);
    if (prop.forSale) rows.push(['For sale', `${prop.forSale.asking} coins`]);
    body.append(facts(rows));
    if (prop.deeds.length > 1) {
      const ol = h('ol', undefined, 'trace');
      for (const d of prop.deeds.slice(1)) {
        const from = d.from === null ? 'the town' : world.citizens[d.from]!.name;
        const to = d.to === null ? 'the town' : world.citizens[d.to]!.name;
        ol.append(h('li', `Day ${d.day}: ${from} to ${to}, ${d.price} coins`));
      }
      body.append(h('h4', 'Deeds'), ol);
    }
  }
  if (p.key.startsWith('home:')) {
    const hh = world.households[Number(p.key.slice(5))]!;
    const ul = h('ul');
    for (const id of hh.memberIds) ul.append(personLink(world.citizens[id]!, hh.headId === id ? ' — head' : ''));
    body.append(facts([['Household', hh.family], ['Kind', hh.kind.replace(/_/g, ' ')]]), h('h4', 'Lives here'), ul);
  } else if (p.key === 'market' && r) {
    body.append(h('h4', 'Yesterday’s prices'), facts(Object.entries(r.prices).map(([g, v]) => [data.goods.get(g)!.name, `${v.toFixed(1)} (${r.volume[g]} sold)`])));
  } else if (p.key === 'church') {
    body.append(facts([['Church purse', `${world.church.coins}`], ['Priests', `${world.citizens.filter((c) => c.alive && c.office === 'priest').length}`], ['Alms given yesterday', `${r?.flows.churchAlms ?? 0}`]]));
  } else if (p.key === 'granary') {
    body.append(facts(data.town.granary.goods.map((g) => [data.goods.get(g)!.name, `${stockOf(world.granary, g)} in store`])));
  } else if (p.key.startsWith('work:')) {
    const ul = h('ul');
    const here = world.citizens.filter((x) => x.alive && x.trade && (x.workplace ?? `work:${x.trade}`) === p.key);
    for (const c of here) ul.append(personLink(c, c.employer !== undefined ? ` — paid wages by ${world.citizens[c.employer]!.name}` : ''));
    body.append(h('h4', 'Works here'), here.length ? ul : h('p', 'Nobody at the moment.', 'muted'));
  }
  panel.hidden = false;
}

// Start: a new town runs its first day; a saved town picks up the day it was on.
// In development, days can be skipped from the browser console to reach an election quickly.
if (import.meta.env.DEV) (window as unknown as { townDebug: unknown }).townDebug = { world, newDay, setClock: (t: number) => { clock = t; } };
if (world.day === 0) { newDay(); clock = 0.25; } else { startDay(world.reports.at(-1)!); }
document.getElementById('town-name')!.textContent = townName;
if (onTitle) {
  showTitle(data);
  observerG.visible = false;
  hearingG.visible = false;
} else {
  document.getElementById('title')!.hidden = true;
  document.body.classList.remove('on-title');
}

function save(): void {
  if (!storeTown(world, townName, clock)) document.getElementById('events')!.textContent = 'Could not save: browser storage is full or blocked.';
}
if (!onTitle) {
  setInterval(save, 30_000);
  addEventListener('pagehide', save);
}
