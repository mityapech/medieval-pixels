// The title screen: Play (continue your town, or found a new one), Info and Settings, over a slow timelapse of a
// town. Your town is kept in the browser and carries on where you left it, so the game is about one town played
// out slowly, not many seeds. Choosing Play reloads into the chosen town.
import { createWorld, loadWorld, saveWorld, type World } from '../../sim/index';
import type { GameData } from '../../sim/data';

const SAVE_KEY = 'medieval-pixels:town';
const SETTINGS_KEY = 'medieval-pixels:settings';
const PLAY_KEY = 'medieval-pixels:play';

export interface Settings {
  /** Real minutes for one in-game day at 1x. */
  dayMinutes: number;
  /** Game speed when you start playing. */
  startSpeed: number;
  /** Show what people near you are doing, and their progress bars. */
  taskLabels: boolean;
}
const DEFAULTS: Settings = { dayMinutes: 15, startSpeed: 1, taskLabels: true };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function storeSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode: settings last this visit only */ }
}

/** Keeps your town in the browser. Returns false if the browser refused (storage full or blocked). */
export function storeTown(world: World, name: string, clock: number): boolean {
  try {
    localStorage.setItem(SAVE_KEY, saveWorld(world, name));
    localStorage.setItem(`${SAVE_KEY}:clock`, String(clock));
    return true;
  } catch {
    return false;
  }
}

export function savedTown(): { world: World; name: string; savedAt: number; clock: number } | undefined {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    const loaded = text ? loadWorld(text) : undefined;
    return loaded ? { ...loaded, clock: Number(localStorage.getItem(`${SAVE_KEY}:clock`) ?? 0.25) } : undefined;
  } catch {
    return undefined;
  }
}

/** Whether this page load should go straight into playing (the player chose Play on the title screen). */
export function startPlaying(): boolean {
  try {
    if (sessionStorage.getItem(PLAY_KEY)) { sessionStorage.removeItem(PLAY_KEY); return true; }
  } catch { /* storage blocked: always show the title */ }
  return false;
}
function playNow(): void {
  try { sessionStorage.setItem(PLAY_KEY, '1'); } catch { /* ignore */ }
  location.reload();
}

/** A town for the title screen's timelapse: a copy of yours, or a demo town if you have none yet. */
export function backdropTown(data: GameData): { world: World; name: string } {
  const saved = savedTown();
  return saved ? { world: saved.world, name: saved.name } : { world: createWorld(data, 1 + Math.floor(Math.random() * 99999)), name: '' };
}

const PARTS = [
  ['Ash', 'Brook', 'Elder', 'Fern', 'Hollow', 'Marsh', 'Oak', 'Raven', 'Stone', 'Thorn', 'Wold', 'Willow', 'Bram', 'Cold', 'Kings', 'Gold'],
  ['ford', 'wick', 'bury', 'ham', 'stead', 'mere', 'haven', 'by', 'ton', 'dale', 'well', 'bridge'],
];
const townName = () => `${PARTS[0]![Math.floor(Math.random() * 16)]}${PARTS[1]![Math.floor(Math.random() * 12)]}`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function showPage(page: 'main' | 'info' | 'settings' | 'new'): void {
  for (const p of ['main', 'info', 'settings', 'new']) $(`title-${p}`).hidden = p !== page;
}

let wired = false;

/**
 * Shows the title screen. At start-up (`inGame` unset) Play goes into your town (or founds one); from the game's
 * Menu, Play returns to the town. Founding a new town always starts it fresh.
 */
export function showTitle(data: GameData, inGame?: { onResume: () => void; onSettings: (s: Settings) => void }): void {
  const screen = $('title');
  screen.hidden = false;
  document.body.classList.add('on-title');
  showPage('main');
  const saved = savedTown();
  $('btn-play').textContent = inGame ? 'Back to the town' : saved ? 'Continue' : 'Play';
  $('title-continue').textContent = saved ? `${saved.name}, day ${saved.world.day}` : 'No town yet: found your first.';
  $('btn-newtown').hidden = !saved;
  const s = loadSettings();
  $<HTMLSelectElement>('set-day').value = String(s.dayMinutes);
  $<HTMLSelectElement>('set-speed').value = String(s.startSpeed);
  $<HTMLInputElement>('set-labels').checked = s.taskLabels;
  current = { data, inGame, saved: !!saved };
  if (wired) return;
  wired = true;

  $('btn-play').addEventListener('click', () => {
    if (current.inGame) { $('title').hidden = true; document.body.classList.remove('on-title'); current.inGame.onResume(); return; }
    if (current.saved) playNow();
    else openNew();
  });
  $('btn-newtown').addEventListener('click', openNew);
  $('btn-info').addEventListener('click', () => showPage('info'));
  $('btn-settings').addEventListener('click', () => showPage('settings'));
  document.querySelectorAll<HTMLElement>('.title-back').forEach((b) => b.addEventListener('click', () => showPage('main')));
  $('new-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>('new-name').value.trim() || townName();
    const seedText = $<HTMLInputElement>('new-seed').value.trim();
    const seed = seedText ? Math.max(1, Math.floor(Number(seedText)) || 1) : 1 + Math.floor(Math.random() * 99999);
    storeTown(createWorld(current.data, seed), name, 0.25);
    playNow();
  });
  $('settings-form').addEventListener('change', () => {
    const next: Settings = {
      dayMinutes: Number($<HTMLSelectElement>('set-day').value),
      startSpeed: Number($<HTMLSelectElement>('set-speed').value),
      taskLabels: $<HTMLInputElement>('set-labels').checked,
    };
    storeSettings(next);
    current.inGame?.onSettings(next);
  });
  function openNew(): void {
    showPage('new');
    $<HTMLInputElement>('new-name').value = townName();
    $('new-warning').hidden = !current.saved;
  }
}
let current: { data: GameData; inGame?: { onResume: () => void; onSettings: (s: Settings) => void }; saved: boolean };
