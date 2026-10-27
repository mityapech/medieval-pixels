// Health and leisure. People fall ill now and then and cannot work while sick; a healer at the infirmary helps
// them recover sooner and makes death rarer (the very young and the old are most at risk). In the evenings,
// those whose household can spare it go to the tavern for a couple of ales and some company.
import { cheapestMeal, foodReserveCoins } from './agent';
import type { GameData } from './data';
import { afterDeath, householdOf, isAdult, kinOf, livingMembers } from './family';
import { takeGoods } from './inventory';
import { buyBest, type DayTally } from './market';
import { remember } from './memory';
import { random } from './rng';
import type { Citizen, World } from './types';

export function hasHealer(world: World): boolean {
  return world.citizens.some((c) => c.alive && c.office === 'healer');
}

/** Daily: some fall ill, the sick get better or (rarely) die. Returns who fell ill and who died. */
export function healthDay(world: World, data: GameData, events: string[]): { fellIll: number; died: { id: number; name: string; age: number }[] } {
  const h = data.town.health;
  const healer = hasHealer(world);
  const outbreak = world.events.some((e) => e.id === 'fever') ? 4 : 1;
  let fellIll = 0;
  const died: { id: number; name: string; age: number }[] = [];
  for (const c of world.citizens) {
    if (!c.alive) continue;
    if (!c.sick) {
      if (random(world) < (h.illnessPerYear / data.town.growth.yearDays) * outbreak) {
        c.sick = h.sickDays[0] + Math.floor(random(world) * (h.sickDays[1] - h.sickDays[0] + 1));
        fellIll++;
        remember(world, c, 'fell_ill');
      }
      continue;
    }
    const risk = c.age < 5 ? h.deathPerSickDay.young : c.age >= data.town.workingAge.elder ? h.deathPerSickDay.old : h.deathPerSickDay.adult;
    if (random(world) < risk * (healer ? h.healerDeathFactor : 1)) {
      c.alive = false;
      c.diedOnDay = world.day;
      died.push({ id: c.id, name: c.name, age: c.age });
      for (const k of kinOf(world, c)) remember(world, k.person, 'lost_kin', { name: c.name.split(' ')[0]!, relation: k.relation });
      events.push(...afterDeath(world, data, c));
      continue;
    }
    c.sick--;
    if (c.sick <= 0 || random(world) < h.recoverPerDay + (healer ? h.healerRecoverBonus : 0)) c.sick = 0;
  }
  return { fellIll, died };
}

/** Evening: adults whose household can spare it buy a couple of ales at the tavern, drunk there and then. */
export function tavernEvening(world: World, data: GameData, tally: DayTally): number {
  const t = data.town.tavern;
  let goers = 0;
  for (const c of world.citizens) {
    c.today.tavern = false;
    if (!c.alive || c.sick || !isAdult(data, c) || c.age >= data.town.workingAge.elder + 10) continue;
    const members = livingMembers(world, householdOf(world, c));
    const purse = members.reduce((s, m) => s + m.coins, 0);
    if (purse < t.visitAboveDays * members.length * cheapestMeal(data, c) || random(world) >= t.visitChance) continue;
    const got = buyBest(world, data, c, ['ale'], t.alePerVisit, foodReserveCoins(world, data, c), tally, null);
    if (got <= 0) continue;
    takeGoods(c, 'ale', got);
    c.today.tavern = true;
    goers++;
  }
  return goers;
}

export type { Citizen };
