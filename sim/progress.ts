// Progression: how the town fares over the years, and how its homes change with it. The town's fortune is a single
// score (0 to 100) from how well-off its families are, how it has grown, the state of its buildings, work, and
// hardship; it gives the town a standing, from destitute to prosperous. Prosperous families who own their home have
// builders enlarge it (cottage, then house, then townhouse); poor ones let it run down.
import { cheapestMeal } from './agent';
import type { GameData } from './data';
import { livingMembers } from './family';
import type { Citizen, Fortune, World } from './types';

export const STANDINGS: [number, string][] = [
  [25, 'Destitute'], [40, 'Struggling hamlet'], [55, 'Humble village'], [70, 'Modest market town'], [85, 'Thriving town'], [101, 'Prosperous town'],
];

const TIER_NAMES = ['cottage', 'house', 'townhouse'];
export function tierName(tier: number): string {
  return TIER_NAMES[Math.max(1, Math.min(3, tier)) - 1]!;
}

/** The town's fortune today. */
export function fortuneOf(world: World, data: GameData): Fortune {
  const living = world.citizens.filter((c) => c.alive);
  if (!living.length) return { score: 0, level: STANDINGS[0]![1] };
  const meal = cheapestMeal(data, living[0]!);
  // Savings per person, in days of food (median household).
  const perPerson = world.households.map((h) => livingMembers(world, h)).filter((m) => m.length)
    .map((m) => m.reduce((s, c) => s + c.coins, 0) / m.length / meal).sort((a, b) => a - b);
  const days = perPerson[Math.floor(perPerson.length / 2)] ?? 0;
  const growth = (living.length - world.foundingPopulation) / Math.max(1, world.foundingPopulation);
  const homes = Object.entries(world.buildings).filter(([k]) => k.startsWith('home:'));
  const condition = homes.length ? homes.reduce((s, [, b]) => s + b.condition, 0) / homes.length : 60;
  const tiers = Object.values(world.property).filter((p) => p.kind === 'home' && p.tier);
  const avgTier = tiers.length ? tiers.reduce((s, p) => s + p.tier!, 0) / tiers.length : 1;
  const hungry = living.filter((c) => c.needs.daysHungry > 0).length / living.length;
  const recent = world.reports.slice(-30);
  const starved = recent.reduce((s, r) => s + r.starved.length, 0);
  const businesses = Object.values(world.property).filter((p) => p.kind === 'business').length;
  const score = 30
    + 10 * Math.log2(Math.max(0.25, days) / 8)
    + 60 * growth
    + 0.3 * (condition - 60)
    + 20 * (avgTier - 1.4)
    + 0.6 * (businesses - 14)
    - 60 * hungry
    - 4 * starved;
  const s = Math.round(Math.max(0, Math.min(100, score)));
  return { score: s, level: STANDINGS.find(([below]) => s < below)![1] };
}

/** Weekly: families who own their home and have plenty to spare have it enlarged. Returns news. */
export function improveHomes(world: World, data: GameData): string[] {
  const news: string[] = [];
  const cfg = data.town.progress;
  for (const [key, p] of Object.entries(world.property)) {
    if (p.kind !== 'home' || !key.startsWith('home:') || (p.tier ?? 1) >= 3 || world.projects.some((x) => x.key === key)) continue;
    const h = world.households[Number(key.slice(5))];
    if (!h || p.owner === null) continue;
    const members = livingMembers(world, h);
    if (!members.length) continue;
    const owner = world.citizens[p.owner]!;
    const purse = members.reduce((s, c) => s + c.coins, 0);
    const daily = members.length * cheapestMeal(data, owner) + 4;
    // A family that owns its home enlarges it when it can spare the money. A landlord improves a house they let
    // when the tenants are doing well enough to pay more rent, and has the money for builders.
    const own = members.includes(owner);
    const ownerPurse = livingMembers(world, world.households[owner.householdId]!).reduce((s, c) => s + c.coins, 0);
    const ready = own
      ? purse >= cfg.improveAboveDays * daily * (p.tier ?? 1)
      : purse >= cfg.improveAboveDays * daily && ownerPurse >= cfg.landlordImproveAbove * daily * 3;
    if (!ready) continue;
    world.projects.push({ key, owner: owner.id, kind: 'upgrade', progress: 0, days: data.town.construction.newHouseDays });
    news.push(own ? `The ${h.family} family hired builders to enlarge their ${tierName(p.tier ?? 1)}`
      : `${owner.name} is having the ${h.family} family's ${tierName(p.tier ?? 1)} enlarged`);
  }
  return news;
}

/** An improvement is finished: the home goes up a tier. */
export function finishUpgrade(world: World, key: string, owner: Citizen): string {
  const p = world.property[key];
  if (!p) return `Building work on ${key} was abandoned`;
  p.tier = Math.min(3, (p.tier ?? 1) + 1);
  const place = world.land.places.find((q) => q.key === key);
  const h0 = key.startsWith('home:') ? world.households[Number(key.slice(5))] : undefined;
  const family = h0?.family ?? owner.name.split(' ').slice(1).join(' ');
  if (place) {
    place.label = `${family} ${tierName(p.tier)}`;
    place.sprite = p.tier >= 3 ? 'townhouse' : 'house';
  }
  world.buildings[key] = { condition: 100 };
  // A better home lets for more.
  if (p.rent) p.rent = Math.ceil(p.rent * 1.35);
  const h = key.startsWith('home:') ? world.households[Number(key.slice(5))] : undefined;
  return `The ${h?.family ?? family} home is now a ${tierName(p.tier)}`;
}
