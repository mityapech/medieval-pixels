// Election day, watched live: the overlay with each candidate's vote bar, filled one ballot at a time as voters
// reach the market, then the winner announced. Also the candidates' campaign speeches. The simulation has already
// decided every ballot (DayReport.election); this only shows them being cast through the day.
import type { DayReport, Doctrine } from '../../sim/index';
import { doctrineName } from '../../sim/politics';
import { DOCTRINE_COLOUR, badge } from './hall';

/** When the polls open and close, and when the winner is announced (fractions of the day). */
export const POLLS = { open: 0.32, close: 0.7, announce: 0.72, closeOverlay: 0.9 };

/** When a voter casts their ballot: spread through the polling hours, the same for them all day. */
export function voteTime(id: number): number {
  const k = ((id * 2654435761) >>> 0) % 1000 / 1000;
  return POLLS.open + k * (POLLS.close - POLLS.open - 0.04);
}

const SPEECHES: Record<Doctrine, string[]> = {
  liberal: ['Bread, schooling and healing for every family!', 'More teachers, more healers!', 'Alms for those who fall on hard times.', 'Cap the rents: a roof for everyone!'],
  traditionalist: ['Order, faith and the old ways!', 'More guards on the walls, more priests in the church.', 'Our fathers built this town. Keep it as they made it.', 'No more rabble at the gates!'],
  isolationist: ['Our town, our grain, our coin!', 'Not one sack of grain leaves this town while we go hungry.', 'Tax the foreign wares at the gate!', 'Fill the granary to the rafters!'],
  freemarket: ['Low taxes, open roads, and let trade decide!', 'Cheaper plots for those who build.', 'Cut the tax and watch the stalls fill!', 'A smaller town hall and a bigger market.'],
};
export function speech(d: Doctrine, n: number): string {
  const lines = SPEECHES[d];
  return lines[n % lines.length]!;
}

type Election = NonNullable<DayReport['election']>;

/** The overlay for one election day. */
export class ElectionView {
  private counts = new Map<number, number>();
  private counted = new Set<number>();
  private rows = new Map<number, { fill: HTMLElement; num: HTMLElement }>();
  private last: HTMLElement;
  private status: HTMLElement;
  private total: number;
  announced = false;

  constructor(private root: HTMLElement, readonly e: Election, day: number, townName: string, slowed: boolean) {
    this.total = Object.keys(e.ballots).length;
    root.replaceChildren();
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => { root.hidden = true; });
    const h = document.createElement('h3');
    h.textContent = `Election day in ${townName || 'the town'}`;
    this.status = document.createElement('p');
    this.status.className = 'sub';
    root.append(close, h, this.status);
    for (const c of e.candidates) {
      this.counts.set(c.id, 0);
      const row = document.createElement('div');
      row.className = 'cand';
      const name = document.createElement('span');
      name.append(document.createTextNode(`${c.name} `), badge(c.doctrine));
      const num = document.createElement('b');
      num.textContent = '0';
      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = '0%';
      fill.style.background = DOCTRINE_COLOUR[c.doctrine];
      track.append(fill);
      row.append(name, num, track);
      root.append(row);
      this.rows.set(c.id, { fill, num });
    }
    this.last = document.createElement('p');
    this.last.className = 'sub last-vote';
    root.append(this.last);
    this.setStatus(0, day, slowed);
    root.hidden = false;
  }

  private setStatus(clock: number, day = 0, slowed = false): void {
    if (clock < POLLS.open) this.status.textContent = `Day ${day}. The polls open at ${hhmm(POLLS.open)}.${slowed ? ' The game is slowed to 10× so you can watch.' : ''}`;
    else if (clock < POLLS.close) this.status.textContent = `Voting at the market: ${this.counted.size} of ${this.total} ballots cast.`;
    else if (!this.announced) this.status.textContent = 'The polls are closed. Counting the ballots…';
  }

  /** A voter's ballot is counted. Returns the candidate they voted for. */
  cast(voter: number, voterName: string): number | undefined {
    if (this.counted.has(voter)) return undefined;
    const cand = this.e.ballots[voter];
    if (cand === undefined) return undefined;
    this.counted.add(voter);
    this.counts.set(cand, (this.counts.get(cand) ?? 0) + 1);
    const most = Math.max(...this.counts.values(), 1);
    for (const [id, r] of this.rows) {
      r.num.textContent = String(this.counts.get(id));
      r.fill.style.width = `${(100 * this.counts.get(id)!) / Math.max(most, this.total / this.rows.size)}%`;
    }
    const c = this.e.candidates.find((x) => x.id === cand)!;
    this.last.textContent = `${voterName} voted for ${c.name}.`;
    return cand;
  }

  /** Every ballot not yet shown (voters who did not walk in, or a day skipped), counted at once. */
  countRest(name: (id: number) => string): void {
    for (const v of Object.keys(this.e.ballots)) this.cast(Number(v), name(Number(v)));
  }

  update(clock: number): void {
    this.setStatus(clock);
  }

  announce(): void {
    this.announced = true;
    const w = this.e.candidates.find((c) => c.id === this.e.winner)!;
    this.status.textContent = `All ${this.total} ballots counted.`;
    this.last.textContent = '';
    const p = document.createElement('p');
    p.className = 'winner';
    p.style.color = DOCTRINE_COLOUR[w.doctrine];
    p.textContent = `${w.name} is elected mayor! ${doctrineName(w.doctrine)}s take the Town Hall.`;
    this.root.append(p);
    this.rows.get(w.id)?.fill.parentElement?.parentElement?.classList.add('won');
  }

  hide(): void {
    this.root.hidden = true;
  }
}

function hhmm(t: number): string {
  const m = Math.round(t * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
