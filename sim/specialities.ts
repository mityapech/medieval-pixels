// Merchants specialise: each deals in one group of goods (data/routines.json), chosen to fill the gap
// when they take up the trade, so the town tends to have someone for grain, for timber, for iron and so on.
import routinesJson from '../data/routines.json';
import type { Citizen, GoodId, World } from './types';

const GROUPS = routinesJson.merchantSpecialities as Record<string, GoodId[]>;
export const SPECIALITIES = Object.keys(GROUPS);

/** The merchant's speciality, choosing the least-covered one the first time it is asked. */
export function specialityOf(world: World, m: Citizen): string {
  if (m.speciality && GROUPS[m.speciality]) return m.speciality;
  const count = (s: string) => world.citizens.filter((c) => c.alive && c !== m && c.trade === 'merchant' && c.speciality === s).length;
  m.speciality = [...SPECIALITIES].sort((a, b) => count(a) - count(b) || ((m.id + SPECIALITIES.indexOf(a)) % 4) - ((m.id + SPECIALITIES.indexOf(b)) % 4))[0]!;
  return m.speciality;
}

export function dealsIn(world: World, m: Citizen, good: GoodId): boolean {
  return GROUPS[specialityOf(world, m)]!.includes(good);
}
