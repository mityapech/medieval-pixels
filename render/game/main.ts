// Town View: the bare-bones graphical town. Placeholder squares and labels on a tile map, people walking
// between home, work and the market through the day, conversations overheard when the observer is near,
// and click-to-inspect records. The simulation advances one day at midnight.
import { Application, Container, Graphics, Text } from 'pixi.js';
import spritesJson from '../../data/sprites.json';
import {
  cheapestMeal, createWorld, householdOf, kinOf, livingMembers, loadData, stockOf, tick, traceBatch, type Citizen, type Conversation,
  type DayReport,
} from '../../sim/index';
import { TILE, WORKPLACE, centre, layoutTown, spotIn, type Place } from './layout';

const data = loadData();
const params = new URLSearchParams(location.search);
const seed = Math.max(1, Number(params.get('seed')) || 1);
const world = createWorld(data, seed);
const places = layoutTown(world);
const MAP_W = world.land.width;
const MAP_H = world.land.height;

// ---------- time ----------

const DAY_MS = 4 * 60 * 1000; // one in-game day is about 4 real minutes at 1x (DESIGN.md section 3)
let speed = Number(params.get('speed') ?? 1);
let clock = 0.25; // fraction of the day; the town wakes at 06:00
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
  market: 0xd9c9a3, church: 0xb9b4c9, granary: 0xc9a66b, fields: 0x9fc27a, woods: 0x5f8a5a,
  bakery: 0xe0a86b, smithy: 0x8a8a8a, merchants: 0xd4b483, house: 0xc89b74, townhouse: 0xb07d5a,
};
// Occupation colours: the same fixed order as the occupations chart on the stats page.
const JOB_COLOUR: Record<string, number> = {
  farmer: 0x2a78d6, baker: 0xeb6834, laborer: 0x1baf7a, blacksmith: 0xeda100,
  merchant: 0xe87ba4, guard: 0x008300, priest: 0x6250d6, servant: 0xe34948,
};
const IDLE_COLOUR = 0xf0efec;

function spriteFor(name: string): { sprite: string; colour: number } {
  return { sprite: SPRITES.places[name] ?? name, colour: PLACEHOLDER[name] ?? 0xaaaaaa };
}

// ---------- scene ----------

const app = new Application();
await app.init({ resizeTo: window, background: '#6f8f5a', antialias: false, autoDensity: true, resolution: devicePixelRatio });
document.getElementById('map')!.append(app.canvas);

const scene = new Container();
app.stage.addChild(scene);
const ground = new Graphics();
const placeLayer = new Container();
const peopleLayer = new Container();
const bubbleLayer = new Container();
scene.addChild(ground, placeLayer, peopleLayer, bubbleLayer);

// The land: grass with a little variation, the river, woods, rock and the roads, all generated for this seed.
const TERRAIN_COLOUR = { grass: 0x7fa36a, water: 0x4f86b5, forest: 0x46703f, rock: 0x8d8a80 } as const;
world.land.terrain.forEach((t, i) => {
  const x = i % MAP_W;
  const y = Math.floor(i / MAP_W);
  const shade = t === 'grass' && (x * 7 + y * 13) % 5 === 0 ? 0x78996a : TERRAIN_COLOUR[t];
  ground.rect(x * TILE, y * TILE, TILE, TILE).fill(shade);
  if (t === 'forest') ground.circle(x * TILE + 10 + ((x * 5 + y) % 12), y * TILE + 12 + ((y * 3 + x) % 9), 7).fill(0x365a31);
});
for (const r of world.land.roads) {
  const x = r % MAP_W;
  const y = Math.floor(r / MAP_W);
  const onWater = world.land.terrain[r] === 'water';
  ground.rect(x * TILE, y * TILE, TILE, TILE).fill(onWater ? 0x8a6a45 : 0xcdb58a); // a wooden bridge over the river
}
for (let x = 0; x <= MAP_W; x++) ground.rect(x * TILE, 0, 1, MAP_H * TILE).fill({ color: 0x000000, alpha: 0.04 });
for (let y = 0; y <= MAP_H; y++) ground.rect(0, y * TILE, MAP_W * TILE, 1).fill({ color: 0x000000, alpha: 0.04 });

function label(text: string, size = 11, colour = 0x1a1a19): Text {
  return new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: size, fill: colour, fontWeight: '600' }, resolution: 3 });
}

for (const p of places.values()) {
  const { colour } = spriteFor(p.sprite);
  const g = new Graphics()
    .rect(p.x * TILE + 2, p.y * TILE + 2, p.w * TILE - 4, p.h * TILE - 4).fill(colour)
    .rect(p.x * TILE + 2, p.y * TILE + 2, p.w * TILE - 4, p.h * TILE - 4).stroke({ width: 2, color: 0x3a3226, alpha: 0.5 });
  g.eventMode = 'static';
  g.cursor = 'pointer';
  g.on('pointertap', () => inspectPlace(p));
  const t = label(p.label, p.sprite === 'house' ? 9 : 12);
  t.position.set(p.x * TILE + 6, p.y * TILE + 5);
  placeLayer.addChild(g, t);
}

// People: small squares, coloured by occupation.
interface Walker { c: Citizen; g: Graphics; x: number; y: number }
const walkers = new Map<number, Walker>();
for (const c of world.citizens) {
  const home = centre(places.get(`home:${c.householdId}`)!);
  const g = new Graphics();
  g.eventMode = 'static';
  g.cursor = 'pointer';
  g.on('pointertap', (e) => { e.stopPropagation(); inspectCitizen(c); });
  peopleLayer.addChild(g);
  walkers.set(c.id, { c, g, x: home.x, y: home.y });
}

function drawWalker(w: Walker): void {
  const colour = w.c.office ? JOB_COLOUR[w.c.office]! : w.c.trade ? JOB_COLOUR[w.c.trade]! : IDLE_COLOUR;
  const size = w.c.age < data.town.workingAge.adult ? 7 : 10;
  w.g.clear().rect(-size / 2, -size / 2, size, size).fill(colour).stroke({ width: 1.5, color: 0x1a1a19 });
  if (selected === w.c.id) w.g.rect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6).stroke({ width: 2, color: 0xffffff });
  w.g.visible = w.c.alive;
  w.g.position.set(w.x, w.y);
}

// The observer stands in for the player until the player milestone: walk around and overhear people.
const observer = centre(places.get('market')!);
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

function target(c: Citizen, t: number): { x: number; y: number } {
  const home = placeFor(`home:${c.householdId}`)!;
  const talking = talks.find((k) => k.c.participants.includes(c.id) && t >= k.start && t < k.start + 0.03);
  if (talking) return spotIn(talking.place, c.id);
  const p = phase(t);
  if (p === 'night' || p === 'morning' || p === 'evening') return spotIn(home, c.id);
  if (p === 'work') {
    if (c.trade) return spotIn(placeFor(WORKPLACE[c.trade])!, c.id);
    if (c.office === 'priest') return spotIn(placeFor('church')!, c.id);
    if (c.office === 'guard') return spotIn(placeFor('market')!, c.id);
    if (c.office === 'servant' && c.employerHousehold !== null) return spotIn(placeFor(`home:${c.employerHousehold}`)!, c.id);
    return spotIn(home, c.id);
  }
  // Market time: heads of households shop, sellers keep stalls, everyone else goes home.
  const head = householdOf(world, c).headId === c.id;
  if (head || c.trade || c.office === 'guard') return spotIn(placeFor('market')!, c.id);
  return spotIn(home, c.id);
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

function newDay(): void {
  const report = tick(world, data);
  scheduleTalks(report.conversations);
  postNews(report);
  refreshMoney();
  if (selected !== null) inspectCitizen(world.citizens[selected]!);
}

// ---------- speech bubbles and the overheard log ----------

interface Bubble { box: Container; until: number; speaker: number }
let bubbles: Bubble[] = [];
const LINE_MS = 3200;

function say(speaker: Citizen, text: string, delay: number): void {
  const box = new Container();
  const t = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: 0x0b0b0b, wordWrap: true, wordWrapWidth: 200 }, resolution: 3 });
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

  // Observer walks at the same speed whatever the game speed.
  const step = 0.25 * dt;
  if (keys.has('w') || keys.has('arrowup')) observer.y -= step;
  if (keys.has('s') || keys.has('arrowdown')) observer.y += step;
  if (keys.has('a') || keys.has('arrowleft')) observer.x -= step;
  if (keys.has('d') || keys.has('arrowright')) observer.x += step;
  observer.x = Math.min(MAP_W * TILE, Math.max(0, observer.x));
  observer.y = Math.min(MAP_H * TILE, Math.max(0, observer.y));
  observerG.position.set(observer.x, observer.y);
  hearingG.position.set(observer.x, observer.y);

  // People walk towards where they want to be.
  const walk = 0.14 * dt * Math.max(1, speed);
  for (const w of walkers.values()) {
    if (!w.c.alive) { w.g.visible = false; continue; }
    const to = target(w.c, clock);
    const dx = to.x - w.x;
    const dy = to.y - w.y;
    const d = Math.hypot(dx, dy);
    if (d > walk) { w.x += (dx / d) * walk; w.y += (dy / d) * walk; } else { w.x = to.x; w.y = to.y; }
    drawWalker(w);
  }

  // Conversations start at their time; only those within hearing of the observer are shown.
  for (const k of talks) {
    if (k.shown || clock < k.start) continue;
    k.shown = true;
    const at = centre(k.place);
    if (Math.hypot(at.x - observer.x, at.y - observer.y) <= HEARING + Math.max(k.place.w, k.place.h) * TILE / 2) overhear(k);
  }
  const now = performance.now();
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
  (document.getElementById('ledger') as HTMLAnchorElement).href = `/stats.html?seed=${seed}&days=${Math.max(100, world.day)}`;
}

// ---------- controls: step a day, start a new town ----------

document.getElementById('step')!.addEventListener('click', () => {
  // Finish today's remaining conversations unheard and jump to the next morning.
  newDay();
  clock = 0.25;
});
const seedInput = document.getElementById('seed') as HTMLInputElement;
seedInput.value = String(seed);
document.getElementById('newtown')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const next = Math.max(1, Math.floor(Number(seedInput.value) || 1));
  location.search = `?seed=${next === seed ? 1 + Math.floor(Math.random() * 99999) : next}&speed=${speed}`;
});

// ---------- town news: deaths, work, families, events, trade ----------

function postNews(r: DayReport): void {
  const items: string[] = [];
  for (const e of r.eventsStarted) items.push(`Event: ${e}`);
  for (const s of r.starved) items.push(`${s.name} starved`);
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

function showTab(which: 'log' | 'news'): void {
  document.getElementById('log')!.hidden = which !== 'log';
  document.getElementById('news')!.hidden = which !== 'news';
  document.getElementById('tab-log')!.setAttribute('aria-selected', String(which === 'log'));
  document.getElementById('tab-news')!.setAttribute('aria-selected', String(which === 'news'));
}
document.getElementById('tab-log')!.addEventListener('click', () => showTab('log'));
document.getElementById('tab-news')!.addEventListener('click', () => showTab('news'));

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
      ['Work', job],
      ['Traits', c.traits.join(', ')],
      ['Household', `${hh.family} (${members.length} living)${hh.headId === c.id ? ', head' : ''}`],
      ['Coins', `${c.coins} (household ${purse})`],
      ['Worries', worries.join('; ') || 'none pressing'],
    ]),
  );
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
  selected = null;
  const r = world.reports.at(-1);
  body.replaceChildren(h('h3', p.label), h('p', `Sprite: ${spriteFor(p.sprite).sprite} (placeholder)`, 'muted'));
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
    const trade = p.key.slice(5);
    const ul = h('ul');
    for (const c of world.citizens.filter((x) => x.alive && x.trade === trade)) ul.append(personLink(c));
    body.append(h('h4', 'Works here'), ul);
  }
  panel.hidden = false;
}

// Start: the first day's work has already happened in the simulation; replay it from morning.
newDay();
clock = 0.25;
