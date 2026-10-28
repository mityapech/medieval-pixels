// The player's powers, in the person inspector: rename someone or their family, set their coins, marry or part
// them, move them to another household, or make them its head. Each one is a sim/god.ts power; what it did goes to
// the town news, and anything it refuses is shown under the form.
import {
  canMarry, divorce, householdOf, livingMembers, makeHead, marry, moveToFamily, renameCitizen, renameFamily, setCoins,
  type Citizen, type GameData, type World,
} from '../../sim/index';

/** Whether the powers were left open, so they stay open when the inspector redraws. */
let open = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

export function renderPowers(world: World, data: GameData, c: Citizen, done: (news: string) => void): HTMLElement {
  const box = el('details', undefined, 'powers');
  box.open = open;
  box.addEventListener('toggle', () => { open = box.open; });
  box.append(el('summary', '✦ Powers'));
  if (!c.alive) { box.append(el('p', 'The dead are beyond your reach.', 'muted')); return box; }
  const error = el('p', '', 'power-error');
  const run = (power: () => string) => {
    try { done(power()); } catch (e) { error.textContent = (e as Error).message; }
  };

  /** One row: a label, a field, and a button that uses the field's value. */
  const row = (label: string, field: HTMLInputElement | HTMLSelectElement, button: string, act: () => string) => {
    const r = el('div', undefined, 'power-row');
    const b = el('button', button);
    b.type = 'button';
    b.addEventListener('click', () => run(act));
    field.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') run(act); });
    const l = el('label', label);
    l.append(field);
    r.append(l, b);
    box.append(r);
  };
  const input = (value: string, type = 'text') => { const i = el('input'); i.type = type; i.value = value; return i; };

  const name = input(c.name);
  row('Name', name, 'Rename', () => renameCitizen(world, c, name.value));
  const h = householdOf(world, c);
  const family = input(h.family);
  row('Family name', family, 'Rename', () => renameFamily(world, h, family.value));
  const coins = input(String(c.coins), 'number');
  coins.min = '0';
  row(`Coins (the heavens hold ${world.heavens.coins})`, coins, 'Set', () => setCoins(world, c, Number(coins.value)));

  const spouse = c.spouseId !== null ? world.citizens[c.spouseId]! : undefined;
  if (spouse?.alive) {
    const r = el('div', undefined, 'power-row');
    const b = el('button', `Part from ${spouse.name}`);
    b.type = 'button';
    b.addEventListener('click', () => run(() => divorce(world, c)));
    r.append(b);
    box.append(r);
  } else {
    const who = canMarry(world, data, c).sort((a, b) => Math.abs(a.age - c.age) - Math.abs(b.age - c.age));
    if (who.length) {
      const pick = el('select');
      for (const x of who.slice(0, 40)) { const o = el('option', `${x.name}, ${x.age}`); o.value = String(x.id); pick.append(o); }
      row('Marry', pick, 'Marry', () => marry(world, data, c, world.citizens[Number(pick.value)]!));
    }
  }

  const homes = world.households.filter((x) => x.id !== h.id && livingMembers(world, x).length).sort((a, b) => a.family.localeCompare(b.family));
  const to = el('select');
  for (const x of homes) { const o = el('option', `${x.family} (${world.citizens[x.headId]!.name})`); o.value = String(x.id); to.append(o); }
  row('Move in with', to, 'Move', () => moveToFamily(world, c, world.households[Number(to.value)]!));

  if (h.headId !== c.id && c.age >= data.town.workingAge.adult) {
    const r = el('div', undefined, 'power-row');
    const b = el('button', `Make head of the ${h.family} household`);
    b.type = 'button';
    b.addEventListener('click', () => run(() => makeHead(world, data, c)));
    r.append(b);
    box.append(r);
  }
  box.append(error);
  return box;
}
