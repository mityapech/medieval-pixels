// Town Ledger: runs the simulation in the browser and charts the town over time.
// Reads only what sim/index.ts exports; nothing here changes the simulation.
import Chart from 'chart.js/auto';
import type { Plugin } from 'chart.js';
import { createWorld, loadData, runDays, type DayReport, type Doctrine, type World } from '../../sim/index';

const data = loadData();

// ---------- colours from the CSS tokens (re-read when the theme changes) ----------

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
// Eight colours; series beyond that reuse them in order.
const slot = (n: number) => token(`--series-${((n - 1) % 8) + 1}`);

// ---------- series helpers ----------

type Reports = DayReport[];
type Value = (r: Reports, i: number) => number | null;
interface Series { label: string; slot: number; value: Value }
interface Group { name: string; series: Series[] }
interface ChartDef {
  id: string;
  title: string;
  what: string;
  unit: string;
  stacked?: boolean;
  percent?: boolean;
  groups: Group[];
}

/** Mean over the last `n` days up to day i, skipping days with no value. */
function rolling(n: number, f: (r: DayReport) => number | null): Value {
  return (rs, i) => {
    const vals = rs.slice(Math.max(0, i - n + 1), i + 1).map(f).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
}

/** Volume-weighted average price over the last 7 days (what people actually paid). */
function price(good: string): Value {
  return (rs, i) => {
    let coins = 0;
    let qty = 0;
    for (const r of rs.slice(Math.max(0, i - 6), i + 1)) {
      const q = r.volume[good] ?? 0;
      if (q && r.prices[good] !== undefined) { coins += r.prices[good]! * q; qty += q; }
    }
    return qty ? coins / qty : null;
  };
}

const goodName = (g: string) => data.goods.get(g)!.name.replace(' and fittings', '');
const GOOD_GROUPS: { name: string; goods: string[] }[] = [
  { name: 'Baked food', goods: ['bread', 'pie', 'tart'] },
  { name: 'Crops', goods: ['wheat', 'vegetables', 'fruit'] },
  { name: 'Materials', goods: ['wood', 'stone', 'iron_ore', 'iron_ingot', 'nails'] },
  { name: 'Tools', goods: ['hoe', 'axe', 'pickaxe'] },
];
// Each good keeps one colour within its group on every chart, so colour always means the same thing.
const goodGroups = (value: (g: string) => Value): Group[] =>
  GOOD_GROUPS.map(({ name, goods }) => ({ name, series: goods.map((g, k) => ({ label: goodName(g), slot: k + 1, value: value(g) })) }));

const JOBS: [string, string][] = [
  ['farmer', 'Farmers'], ['baker', 'Bakers'], ['lumberjack', 'Lumberjacks'], ['miner', 'Miners'], ['forager', 'Foragers'],
  ['fisherman', 'Fishermen'], ['builder', 'Builders'], ['innkeeper', 'Innkeepers'], ['blacksmith', 'Blacksmiths'],
  ['merchant', 'Merchants'], ['guard', 'Guards'], ['priest', 'Priests'], ['teacher', 'Teachers'], ['healer', 'Healers'],
  ['servant', 'Servants'],
];

const DOCTRINES: [Doctrine, string][] = [['liberal', 'Liberal Reformer'], ['traditionalist', 'Traditionalist'], ['isolationist', 'Isolationist'], ['freemarket', 'Free Marketeer']];

const one = (series: Series[]): Group[] => [{ name: '', series }];

const CHARTS: ChartDef[] = [
  {
    id: 'fortune', title: 'Town fortune', unit: 'score (0 to 100)',
    what: 'How the town is faring: savings, growth, the state of its homes, work and hardship. Coloured by the mayor in office: Destitute below 25, Struggling hamlet 25 to 40, Humble village to 55, Modest market town to 70, Thriving town to 85, then Prosperous town.',
    groups: one(DOCTRINES.map(([d, label], k) => ({
      label, slot: k + 1,
      // Each doctrine's line runs only through its mayors' terms (joined at the hand-over so the line is unbroken).
      value: (rs, i) => (rs[i]!.mayor?.doctrine === d || rs[i + 1]?.mayor?.doctrine === d ? rs[i]!.fortune.score : null),
    }))),
  },
  {
    id: 'population', title: 'Population', unit: 'people',
    what: 'People alive, by age group. People are born, grow up, grow old and die, so the town grows or shrinks over time.',
    groups: one([
      { label: 'Everyone', slot: 1, value: (rs, i) => rs[i]!.alive },
      { label: 'Children (under 12)', slot: 2, value: (rs, i) => rs[i]!.ages.children },
      { label: 'Working age', slot: 3, value: (rs, i) => rs[i]!.ages.adults },
      { label: 'Elders (60+)', slot: 4, value: (rs, i) => rs[i]!.ages.elders },
    ]),
  },
  {
    id: 'wealth', title: 'Household wealth', unit: 'coins',
    what: 'Coins held per living household. The median is the household in the middle; the mean is pulled up by the rich.',
    groups: one([
      { label: 'Median household', slot: 1, value: (rs, i) => rs[i]!.wealth.median },
      { label: 'Mean household', slot: 2, value: (rs, i) => Math.round(rs[i]!.wealth.mean) },
    ]),
  },
  {
    id: 'inequality', title: 'Who holds the money', unit: '% of household coins', percent: true,
    what: 'Share of all household coins held by the three richest households, and by the poorer half of households.',
    groups: one([
      { label: 'Richest 3 households', slot: 1, value: (rs, i) => 100 * rs[i]!.wealth.top3Share },
      { label: 'Poorer half of households', slot: 2, value: (rs, i) => 100 * rs[i]!.wealth.poorHalfShare },
    ]),
  },
  {
    id: 'prices', title: 'Prices', unit: 'coins per unit',
    what: 'What people actually paid, averaged over the last 7 days and weighted by how much was bought.',
    groups: goodGroups(price),
  },
  {
    id: 'produced', title: 'Goods produced', unit: 'units per day',
    what: 'Units made in town each day (imports not included), averaged over the last 7 days.',
    groups: goodGroups((g) => rolling(7, (r) => r.produced[g] ?? 0)),
  },
  {
    id: 'jobs', title: 'Occupations', unit: 'people', stacked: true,
    what: 'Who works at what each day, including the authority’s guards and priests and household servants.',
    groups: one(JOBS.map(([key, label], k) => ({ label, slot: k + 1, value: (rs, i) => rs[i]!.jobs[key] ?? 0 }))),
  },
  {
    id: 'unemployment', title: 'Unemployment', unit: '% of working age', percent: true,
    what: 'Working-age people with neither a trade nor a post.',
    groups: one([{ label: 'Unemployed', slot: 1, value: (rs, i) => (100 * (rs[i]!.jobs.unemployed ?? 0)) / Math.max(1, rs[i]!.ages.adults) }]),
  },
  {
    id: 'support', title: 'Help and wages for the poor', unit: 'coins per day',
    what: 'Church alms, almsgiving by the well-off, help from kin, and wages paid to household servants. 7-day average.',
    groups: one([
      { label: 'Church alms', slot: 1, value: rolling(7, (r) => r.flows.churchAlms) },
      { label: 'Almsgiving', slot: 2, value: rolling(7, (r) => r.flows.charity) },
      { label: 'Kin support', slot: 3, value: rolling(7, (r) => r.flows.kinSupport) },
      { label: 'Servant wages', slot: 4, value: rolling(7, (r) => r.flows.servantWages) },
    ]),
  },
  {
    id: 'trade', title: 'Trade with neighbouring towns', unit: 'coins per day',
    what: 'Coins paid abroad for imports and received for exports. 7-day average.',
    groups: one([
      { label: 'Imports', slot: 1, value: rolling(7, (r) => r.imports) },
      { label: 'Exports', slot: 2, value: rolling(7, (r) => r.exports) },
    ]),
  },
  {
    id: 'market', title: 'Market activity', unit: 'coins per day',
    what: 'Value of everything bought in town each day, 7-day average.',
    groups: one([{ label: 'Market sales', slot: 1, value: rolling(7, (r) => Object.entries(r.prices).reduce((s, [g, p]) => s + p * (r.volume[g] ?? 0), 0)) }]),
  },
  {
    id: 'coins', title: 'Coins inside the town', unit: 'coins',
    what: 'All coins held by people, the treasury and the church. Imports send coins abroad; exports bring them back.',
    groups: one([{ label: 'Coins in town', slot: 1, value: (rs, i) => rs[i]!.townCoins }]),
  },
  {
    id: 'authority', title: 'Treasury and church', unit: 'coins',
    what: 'The treasury collects taxes and pays guards and priests; the church gives alms from the treasury’s surplus.',
    groups: one([
      { label: 'Treasury', slot: 1, value: (rs, i) => rs[i]!.treasury },
      { label: 'Church', slot: 2, value: (rs, i) => rs[i]!.church },
    ]),
  },
  {
    id: 'granary', title: 'Public granary', unit: 'units in store',
    what: 'Wheat and vegetables the authority buys in plenty and sells at cost in a shortage.',
    groups: one([{ label: 'Granary stores', slot: 1, value: (rs, i) => rs[i]!.granary }]),
  },
];

// ---------- plugins: crosshair and event bands ----------

interface Span { name: string; from: number; to: number }

/** Contiguous day ranges for each event, from the daily list of active events. */
function eventSpans(reports: Reports): Span[] {
  const spans: Span[] = [];
  const open = new Map<string, Span>();
  reports.forEach((r, i) => {
    for (const name of r.eventsActive) {
      const s = open.get(name);
      if (s && s.to === i - 1) s.to = i;
      else { const n = { name, from: i, to: i }; spans.push(n); open.set(name, n); }
    }
  });
  return spans;
}

let spans: Span[] = [];

const eventBands: Plugin = {
  id: 'eventBands',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    const x = scales.x!;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    let labelEnd = -Infinity;
    for (const s of spans) {
      const left = Math.max(chartArea.left, x.getPixelForValue(s.from) - 2);
      const right = Math.min(chartArea.right, x.getPixelForValue(s.to) + 2);
      ctx.fillStyle = token('--event-band');
      ctx.fillRect(left, chartArea.top, Math.max(2, right - left), chartArea.bottom - chartArea.top);
      // Name in the strip above the plot, cut to the band's width; hidden if it would collide (the tooltip and list still name it).
      let text = s.name;
      const room = Math.max(right - left, 0);
      while (text.length > 3 && ctx.measureText(text).width > room) text = `${text.slice(0, -2).trimEnd()}…`;
      if (left < labelEnd || ctx.measureText(text).width > room || text.length <= 3) continue;
      ctx.fillStyle = token('--text-muted');
      ctx.fillText(text, left + 2, chartArea.top - 3);
      labelEnd = left + ctx.measureText(text).width + 8;
    }
    ctx.restore();
  },
};

/** Leaves a strip between the legend and the plot for event names. */
const legendGap: Plugin = {
  id: 'legendGap',
  beforeInit(chart) {
    const legend = chart.legend as unknown as { fit: () => void; height: number };
    const fit = legend.fit.bind(legend);
    legend.fit = () => {
      fit();
      legend.height += 16;
    };
  },
};

const crosshair: Plugin = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0]!.element.x;
    ctx.save();
    ctx.strokeStyle = token('--baseline');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// ---------- rendering ----------

const charts = new Map<string, { chart: Chart; def: ChartDef; group: number; table: boolean }>();
let reports: Reports = [];

const fmt = (v: number | null | undefined, percent = false) =>
  v === null || v === undefined ? '–' : percent ? `${v.toFixed(1)}%` : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toString();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function datasets(def: ChartDef, group: number) {
  const surface = token('--surface-1');
  return def.groups[group]!.series.map((s) => ({
    label: s.label,
    data: reports.map((_, i) => s.value(reports, i)),
    borderColor: def.stacked ? surface : slot(s.slot),
    backgroundColor: slot(s.slot),
    borderWidth: def.stacked ? 1 : 2,
    fill: def.stacked ? (s === def.groups[group]!.series[0] ? 'origin' : '-1') : false,
    pointRadius: 0,
    pointHoverRadius: def.stacked ? 0 : 4,
    pointHoverBorderColor: surface,
    pointHoverBorderWidth: 2,
    pointStyle: def.stacked ? ('rect' as const) : ('line' as const),
    tension: 0,
    spanGaps: true,
  }));
}

function buildCard(def: ChartDef): void {
  const card = el('article', { class: 'card', id: `card-${def.id}` });
  const head = el('header');
  const titles = el('div');
  titles.append(el('h2', {}, def.title), el('p', { class: 'what' }, def.what));
  const tools = el('div', { class: 'tools' });
  if (def.groups.length > 1) {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': `${def.title}: goods` });
    def.groups.forEach((g, k) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(k === 0) }, g.name);
      b.addEventListener('click', () => {
        const state = charts.get(def.id)!;
        state.group = k;
        seg.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === k)));
        update(def.id);
      });
      seg.append(b);
    });
    tools.append(seg);
  }
  const tableBtn = el('button', { type: 'button', 'aria-pressed': 'false' }, 'Table');
  tableBtn.addEventListener('click', () => {
    const state = charts.get(def.id)!;
    state.table = !state.table;
    tableBtn.setAttribute('aria-pressed', String(state.table));
    tableBtn.textContent = state.table ? 'Chart' : 'Table';
    update(def.id);
  });
  tools.append(tableBtn);
  head.append(titles, tools);
  const plot = el('div', { class: 'plot' });
  const canvas = el('canvas', { role: 'img', 'aria-label': `${def.title} over time` });
  plot.append(canvas);
  const tableWrap = el('div', { class: 'table-wrap', hidden: '' });
  card.append(head, plot, tableWrap);
  document.getElementById('charts')!.append(card);

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: [], datasets: [] },
    plugins: [eventBands, crosshair, legendGap],
    options: {
      animation: false,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4 } },
      scales: {
        x: {
          title: { display: true, text: 'Day', color: token('--text-muted') },
          grid: { display: false },
          border: { color: token('--baseline') },
          ticks: { color: token('--text-muted'), maxTicksLimit: 10, maxRotation: 0 },
        },
        y: {
          stacked: !!def.stacked,
          beginAtZero: true,
          title: { display: true, text: def.unit, color: token('--text-muted') },
          grid: { color: token('--grid'), lineWidth: 1 },
          border: { display: false },
          ticks: { color: token('--text-muted'), maxTicksLimit: 6, callback: (v) => (def.percent ? `${v}%` : Number(v).toLocaleString()) },
          ...(def.percent ? { suggestedMax: 10 } : {}),
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'start',
          labels: { usePointStyle: true, boxWidth: 18, boxHeight: 2, color: token('--text-secondary'), padding: 12 },
        },
        tooltip: {
          backgroundColor: token('--surface-1'),
          borderColor: token('--border'),
          borderWidth: 1,
          titleColor: token('--text-secondary'),
          bodyColor: token('--text-primary'),
          usePointStyle: true,
          boxWidth: 14,
          boxHeight: 2,
          padding: 10,
          itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
          callbacks: {
            title: (items) => {
              const day = Number(items[0]?.label);
              const active = reports[day - 1]?.eventsActive ?? [];
              return `Day ${day}${active.length ? ` · ${active.join(', ')}` : ''}`;
            },
            label: (item) => `${fmt(item.parsed.y, def.percent)}   ${item.dataset.label}`,
          },
        },
      },
    },
  });
  charts.set(def.id, { chart, def, group: 0, table: false });
}

function update(id: string): void {
  const state = charts.get(id)!;
  const { chart, def, group, table } = state;
  const card = document.getElementById(`card-${id}`)!;
  const plot = card.querySelector<HTMLElement>('.plot')!;
  const wrap = card.querySelector<HTMLElement>('.table-wrap')!;
  chart.data.labels = reports.map((r) => String(r.day));
  chart.data.datasets = datasets(def, group);
  chart.update();
  plot.hidden = table;
  wrap.hidden = !table;
  if (table) renderTable(wrap, chart, def);
}

function renderTable(wrap: HTMLElement, chart: Chart, def: ChartDef): void {
  const t = el('table');
  const head = el('tr');
  head.append(el('th', {}, 'Day'));
  for (const ds of chart.data.datasets) head.append(el('th', {}, ds.label ?? ''));
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  reports.forEach((r, i) => {
    const row = el('tr');
    row.append(el('td', {}, String(r.day)));
    for (const ds of chart.data.datasets) row.append(el('td', {}, fmt(ds.data[i] as number | null, def.percent)));
    body.append(row);
  });
  t.append(thead, body);
  wrap.replaceChildren(t);
}

function tile(label: string, value: string, note: string, tone: '' | 'up' | 'down' = ''): HTMLElement {
  const t = el('div', { class: 'tile' });
  t.append(el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), el('div', { class: `note ${tone}` }, note));
  return t;
}

function renderTiles(world: World): void {
  const first = reports[0]!;
  const last = reports.at(-1)!;
  const sum = (f: (r: DayReport) => number) => reports.reduce((s, r) => s + f(r), 0);
  const starved = sum((r) => r.starved.length);
  const born = sum((r) => r.born.length);
  const died = sum((r) => r.diedOfAge.length + r.diedOfIllness.length);
  const change = (now: number, then: number) => {
    const pct = then ? Math.round((100 * (now - then)) / then) : 0;
    return { text: `${pct >= 0 ? '+' : ''}${pct}% since day 1`, tone: (pct >= 0 ? 'up' : 'down') as 'up' | 'down' };
  };
  const wealth = change(last.wealth.median, first.wealth.median);
  const coins = change(last.townCoins, first.townCoins);
  const unemployed = (100 * (last.jobs.unemployed ?? 0)) / Math.max(1, last.ages.adults);
  document.getElementById('tiles')!.replaceChildren(
    tile('Population', `${last.alive}`, `${born} born, ${died} died${starved ? `, ${starved} starved` : ''}`, starved || last.alive < first.alive ? 'down' : 'up'),
    tile('Median household', `${last.wealth.median} coins`, wealth.text, wealth.tone),
    tile('Unemployed', `${unemployed.toFixed(1)}%`, `${last.jobs.unemployed ?? 0} of ${last.ages.adults} working age`),
    tile('Coins in town', last.townCoins.toLocaleString(), coins.text, coins.tone),
    tile('Treasury · Church', `${last.treasury} · ${last.church}`, `${last.guards} guards, ${last.priests} priests`),
    tile('Households', String(last.households), `${last.servants} servants in service`),
  );
}

function renderEvents(): void {
  const list = document.getElementById('events')!;
  const items = spans.map((s) => {
    const li = el('li');
    li.append(el('b', {}, s.name), document.createTextNode(` days ${s.from + 1}–${s.to + 1}`));
    return li;
  });
  list.replaceChildren(...(items.length ? items : [el('li', {}, 'No events this run')]));
}

function run(seed: number, days: number): void {
  const status = document.getElementById('status')!;
  const button = document.getElementById('run') as HTMLButtonElement;
  status.textContent = 'Running…';
  button.disabled = true;
  document.getElementById('charts')!.style.opacity = '0.5';
  // Let the browser paint the busy state before the simulation takes the main thread.
  setTimeout(() => {
    const started = performance.now();
    const world = createWorld(data, seed);
    runDays(world, data, days);
    reports = world.reports;
    spans = eventSpans(reports);
    if (!charts.size) CHARTS.forEach(buildCard);
    for (const id of charts.keys()) update(id);
    renderTiles(world);
    renderEvents();
    status.textContent = `Seed ${seed}: ${days} days in ${Math.round(performance.now() - started)} ms`;
    button.disabled = false;
    document.getElementById('charts')!.style.opacity = '1';
    history.replaceState(null, '', `?seed=${seed}&days=${days}`);
  }, 20);
}

// ---------- controls ----------

const seedInput = document.getElementById('seed') as HTMLInputElement;
const daysInput = document.getElementById('days') as HTMLSelectElement;
const params = new URLSearchParams(location.search);
seedInput.value = params.get('seed') ?? '1';
if (params.get('days')) daysInput.value = params.get('days')!;

document.getElementById('controls')!.addEventListener('submit', (e) => {
  e.preventDefault();
  run(Math.max(1, Math.floor(Number(seedInput.value) || 1)), Number(daysInput.value));
});
document.getElementById('random')!.addEventListener('click', () => {
  seedInput.value = String(1 + Math.floor(Math.random() * 99999));
  run(Number(seedInput.value), Number(daysInput.value));
});

// Colours are read from CSS tokens, so rebuild when the light/dark scheme changes.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  for (const { chart } of charts.values()) chart.destroy();
  charts.clear();
  document.getElementById('charts')!.replaceChildren();
  CHARTS.forEach(buildCard);
  for (const id of charts.keys()) update(id);
});

run(Number(seedInput.value), Number(daysInput.value));
