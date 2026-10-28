// The Town Hall panel: the mayor, their doctrine and promises, the policy in force against the last mayor's, what
// this term has brought, the mayor's decrees and actions, and the mayors before. Read-only.
import type { GameData } from '../../sim/data';
import type { Doctrine, Policy, World } from '../../sim/index';
import { doctrineName, doctrineSlogan, policyFor } from '../../sim/politics';

export const DOCTRINE_COLOUR: Record<Doctrine, string> = {
  liberal: '#2a78d6', traditionalist: '#b03030', isolationist: '#2e8b57', freemarket: '#b8901c',
};

function el(tag: string, text?: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

export function badge(d: Doctrine): HTMLElement {
  const b = el('span', doctrineName(d), 'doctrine-badge');
  b.style.background = DOCTRINE_COLOUR[d];
  return b;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const times = (x: number) => `${Math.round(x * 100)}%`;
const ROWS: [string, (p: Policy) => number | string, ((p: Policy) => number) | null][] = [
  ['Market tax', (p) => pct(p.marketTax), (p) => p.marketTax],
  ['Tax on savings (per day)', (p) => pct(p.hearthTaxShare), (p) => p.hearthTaxShare],
  ['Tariff on imports', (p) => pct(p.tariff), (p) => p.tariff],
  ['Food may leave town', (p) => (p.exportFood ? 'yes' : 'no'), null],
  ['Rents', (p) => (p.rentCapMeals === null ? 'free' : 'capped'), null],
  ['Alms (church share of surplus)', (p) => pct(p.churchGrantShare), (p) => p.churchGrantShare],
  ['Budget for public wages', (p) => pct(p.wageBudgetShare), (p) => p.wageBudgetShare],
  ['Healers wanted', (p) => times(p.posts.healer), (p) => p.posts.healer],
  ['Teachers wanted', (p) => times(p.posts.teacher), (p) => p.posts.teacher],
  ['Priests wanted', (p) => times(p.posts.priest), (p) => p.posts.priest],
  ['Guards wanted', (p) => times(p.posts.guard), (p) => p.posts.guard],
  ['Price of building plots', (p) => times(p.plotPriceFactor), (p) => p.plotPriceFactor],
  ['Cost of the roads', (p) => times(p.roadCostFactor), (p) => p.roadCostFactor],
  ['Granary stores', (p) => times(p.granaryFactor), (p) => p.granaryFactor],
];

export function renderHall(body: HTMLElement, world: World, data: GameData, townName: string, onPerson: (id: number) => void): void {
  body.replaceChildren(el('h3', `${townName} Town Hall`));
  const r = world.reports.at(-1);
  const m = world.mayor;
  if (!m) {
    body.append(el('p', 'The town has not elected a mayor yet.', 'muted'));
    return;
  }
  const mayor = world.citizens[m.id]!;
  const who = el('p');
  const link = el('button', mayor.name, 'person-link');
  link.addEventListener('click', () => onPerson(mayor.id));
  who.append(el('b', 'Mayor: '), link, document.createTextNode(' '), badge(m.doctrine));
  body.append(who, el('p', `“${doctrineSlogan(m.doctrine)}”`, 'muted'));
  body.append(el('p', `In office since day ${m.since}. Next election on day ${m.termEnds} (in ${Math.max(0, m.termEnds - world.day)} days).`));

  if (r?.campaign) {
    body.append(el('h4', `Campaign under way: election on day ${r.campaign.electionDay}`));
    const ul = el('ul');
    for (const c of r.campaign.candidates) {
      const li = el('li');
      li.append(document.createTextNode(`${c.name} `), badge(c.doctrine));
      ul.append(li);
    }
    body.append(ul);
  }

  // The policy in force, against the previous mayor's.
  const prevDoctrine = world.elections.length > 1 ? world.elections.at(-2)!.doctrine : null;
  const now = policyFor(m.doctrine, data);
  const before = policyFor(prevDoctrine, data);
  body.append(el('h4', `Policy (against ${prevDoctrine ? `the last mayor's ${doctrineName(prevDoctrine)}` : 'the old ways'})`));
  const table = el('table');
  for (const [label, show, num] of ROWS) {
    const tr = el('tr');
    const a = show(now);
    const b = show(before);
    let change = '';
    let cls = '';
    if (a !== b) {
      if (num) { const up = num(now) > num(before); change = up ? '▲' : '▼'; cls = up ? 'change-up' : 'change-down'; }
      else change = '●';
    }
    tr.append(el('td', label), el('td', change ? `${b} → ` : '', 'muted'), el('td', `${a} ${change}`, cls));
    table.append(tr);
  }
  body.append(table);

  // What this term has brought so far.
  const term = world.reports.filter((x) => x.day >= m.since);
  if (term.length) {
    const sum = (f: (x: (typeof term)[number]) => number) => term.reduce((s, x) => s + f(x), 0);
    const first = term[0]!;
    const last = term.at(-1)!;
    const offices = (o: string) => world.citizens.filter((c) => c.alive && c.office === o).length;
    body.append(el('h4', 'This term so far'));
    const t2 = el('table');
    const rows: [string, string][] = [
      ['Town standing', `${first.fortune.level} (${first.fortune.score}) → ${last.fortune.level} (${last.fortune.score})`],
      ['Taxes and tariffs collected', `${sum((x) => x.flows.tax)} coins`],
      ['Alms given by the church', `${sum((x) => x.flows.churchAlms)} coins`],
      ['Treasury now', `${last.treasury} coins`],
      ['Public posts now', `${offices('healer')} healers, ${offices('teacher')} teachers, ${offices('priest')} priests, ${offices('guard')} guards`],
      ['Born · died · starved', `${sum((x) => x.born.length)} · ${sum((x) => x.diedOfAge.length + x.diedOfIllness.length)} · ${sum((x) => x.starved.length)}`],
    ];
    for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('td', k), el('td', v)); t2.append(tr); }
    body.append(t2);
  }

  // Decrees and the administration's actions, newest first.
  const decrees = world.decrees.filter((d) => d.mayor === m.id && d.day >= m.since).reverse();
  body.append(el('h4', 'Decrees and actions this term'));
  const ol = el('ul');
  for (const d of decrees.slice(0, 25)) ol.append(el('li', `Day ${d.day}: ${d.text}`));
  body.append(decrees.length ? ol : el('p', 'Nothing yet.', 'muted'));

  // The mayors before.
  if (world.elections.length > 1) {
    body.append(el('h4', 'Mayors of the town'));
    const ul = el('ul');
    world.elections.slice().reverse().forEach((e, i, all) => {
      const until = i === 0 ? 'now' : `day ${all[i - 1]!.day}`;
      const li = el('li');
      li.append(document.createTextNode(`${world.citizens[e.mayor]!.name}, day ${e.day} to ${until} `), badge(e.doctrine));
      ul.append(li);
    });
    body.append(ul);
  }
}
