// DESIGN.md test 2: total coins never change. Coins only move between accounts
// (people, treasury, church, neighbouring towns) and are never created or destroyed.
import { describe, expect, it } from 'vitest';
import { allAccounts } from '../sim/coins';
import { createWorld, loadData, runDays, tick, totalCoins, transfer } from '../sim/index';

const data = loadData();
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('total coins never change', () => {
  it.each(SEEDS)('stays fixed every day for 100 days (seed %i)', (seed) => {
    const world = createWorld(data, seed);
    const start = totalCoins(world);
    expect(start).toBe(world.initialCoins);
    runDays(world, data, 100, (r) => {
      expect(r.totalCoins).toBe(start);
      expect(totalCoins(world)).toBe(start);
    });
  });

  it.each(SEEDS)('every account matches its ledger: start + received - paid (seed %i)', (seed) => {
    const world = createWorld(data, seed);
    const startBalance = new Map(allAccounts(world).map((a) => [a.key, a.coins]));
    runDays(world, data, 100);
    const balance = new Map(startBalance);
    for (const e of world.ledger) {
      expect(Number.isInteger(e.amount) && e.amount > 0).toBe(true);
      balance.set(e.from, balance.get(e.from)! - e.amount);
      balance.set(e.to, balance.get(e.to)! + e.amount);
    }
    // Any coin changed outside transfer() would show up as a mismatch here.
    for (const a of allAccounts(world)) expect(a.coins).toBe(balance.get(a.key));
    for (const a of allAccounts(world)) expect(a.coins).toBeGreaterThanOrEqual(0);
  });

  it('holds while trade with neighbouring towns, taxes, wages, alms, service and the granary all happen', () => {
    const memos = new Set<string>();
    for (const seed of SEEDS) {
      const world = createWorld(data, seed);
      const start = totalCoins(world);
      runDays(world, data, 100);
      expect(totalCoins(world)).toBe(start);
      for (const e of world.ledger) memos.add(e.memo.split(' ')[0]!);
    }
    // Make sure the test actually exercised every kind of payment, not just market sales.
    for (const kind of ['import', 'export', 'market', 'hearth', 'alms', 'servant', 'granary', 'household', 'kin']) expect(memos).toContain(kind);
  });

  it('is unaffected by which day the run stops on', () => {
    const world = createWorld(data, 3);
    const start = totalCoins(world);
    for (let day = 0; day < 30; day++) {
      tick(world, data);
      expect(totalCoins(world)).toBe(start);
    }
  });
});

describe('transfer', () => {
  const world = createWorld(data, 1);
  const [a, b] = world.citizens as [(typeof world.citizens)[0], (typeof world.citizens)[0]];

  it('rejects fractional, negative and unaffordable amounts without moving anything', () => {
    const before = [a.coins, b.coins, world.ledger.length];
    expect(() => transfer(world, a, b, 1.5, 'test')).toThrow();
    expect(() => transfer(world, a, b, -1, 'test')).toThrow();
    expect(() => transfer(world, a, b, a.coins + 1, 'test')).toThrow();
    expect([a.coins, b.coins, world.ledger.length]).toEqual(before);
  });

  it('moves coins exactly and records the payment', () => {
    const total = totalCoins(world);
    const [fromBefore, toBefore] = [a.coins, b.coins];
    transfer(world, a, b, 1, 'test');
    expect(a.coins).toBe(fromBefore - 1);
    expect(b.coins).toBe(toBefore + 1);
    expect(world.ledger.at(-1)).toMatchObject({ from: a.key, to: b.key, amount: 1 });
    expect(totalCoins(world)).toBe(total);
  });
});
