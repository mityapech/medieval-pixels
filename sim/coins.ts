// The only place coins move. The world is closed: coins are never created or destroyed.
import type { Account, World } from './types';

export function transfer(world: World, from: Account, to: Account, amount: number, memo: string): void {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`invalid amount ${amount}`);
  if (from.coins < amount) throw new Error(`${from.name} cannot pay ${amount} (has ${from.coins})`);
  if (from === to || amount === 0) return;
  from.coins -= amount;
  to.coins += amount;
  world.ledger.push({ day: world.day, from: from.key, to: to.key, amount, memo });
}

export function allAccounts(world: World): Account[] {
  return [...world.citizens, world.treasury, world.church, ...world.neighbours];
}

/** Every coin in the world, including the dead's frozen estates and the neighbouring towns. Never changes. */
export function totalCoins(world: World): number {
  return allAccounts(world).reduce((sum, a) => sum + a.coins, 0);
}

/** Coins inside the town: its people, treasury and church. */
export function townCoins(world: World): number {
  return world.citizens.reduce((sum, c) => sum + c.coins, 0) + world.treasury.coins + world.church.coins;
}
