// Town politics: elections happen every term, the mayor's doctrine really sets policy, and the town's fortune moves.
import { describe, expect, it } from 'vitest';
import { createWorld, loadData, tick, totalCoins } from '../sim/index';
import { policyOf } from '../sim/politics';
import type { Doctrine } from '../sim/types';
import politics from '../data/politics.json';

const data = loadData();

describe('politics', () => {
  it('holds an election at the start and every term, always electing a living candidate', () => {
    const w = createWorld(data, 3);
    for (let d = 0; d < 200; d++) {
      const r = tick(w, data);
      expect(r.mayor).not.toBeNull();
      expect(w.citizens[r.mayor!.id]!.alive).toBe(true);
      if (r.election) expect(r.election.candidates.map((c) => c.id)).toContain(r.election.winner);
    }
    expect(w.elections.length).toBeGreaterThanOrEqual(Math.floor(200 / politics.termDays));
  });

  it('a mayor’s doctrine sets the policy in force', () => {
    const w = createWorld(data, 1);
    for (const d of Object.keys(politics.doctrines) as Doctrine[]) {
      w.mayor = { id: 0, doctrine: d, since: 0, termEnds: 1e9 };
      expect(policyOf(w, data)).toMatchObject({ doctrine: d, ...(politics.doctrines as Record<string, { policy: object }>)[d]!.policy });
    }
  });

  it('an isolationist town sends no food abroad, collects tariffs, and still keeps every coin', () => {
    const w = createWorld(data, 2);
    w.mayor = { id: 0, doctrine: 'isolationist', since: 0, termEnds: 1e9 };
    const start = totalCoins(w);
    for (let d = 0; d < 60; d++) tick(w, data);
    const foodExports = w.ledger.filter((e) => /^export \\d+ (bread|pie|tart|vegetables|fruit|fish|berries|mushrooms)\\b/.test(e.memo));
    expect(foodExports).toHaveLength(0);
    expect(w.ledger.some((e) => e.memo.startsWith('tariff on'))).toBe(true);
    expect(totalCoins(w)).toBe(start);
  });

  it('the town’s fortune is a score from 0 to 100 with a named standing, every day', () => {
    const w = createWorld(data, 4);
    for (let d = 0; d < 100; d++) {
      const r = tick(w, data);
      expect(r.fortune.score).toBeGreaterThanOrEqual(0);
      expect(r.fortune.score).toBeLessThanOrEqual(100);
      expect(r.fortune.level.length).toBeGreaterThan(3);
    }
  });
});
