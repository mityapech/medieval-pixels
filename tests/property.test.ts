// DESIGN.md tests 5 and 6: every plot has exactly one owner and a complete deed history, and property money
// moves between people without creating or destroying coins. Plus: owning property is for the few.
import { describe, expect, it } from 'vitest';
import { createWorld, loadData, tick, totalCoins } from '../sim/index';

const data = loadData();

describe('property', () => {
  it.each([1, 2, 3])('every place has exactly one owner and a complete deed history, every day (seed %i)', (seed) => {
    const w = createWorld(data, seed);
    for (let d = 0; d < 100; d++) {
      tick(w, data);
      const keys = w.land.places.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        const p = w.property[key];
        expect(p, key).toBeDefined();
        expect(p!.deeds.length).toBeGreaterThan(0);
        expect(p!.deeds.at(-1)!.to).toBe(p!.owner);
        for (let i = 1; i < p!.deeds.length; i++) expect(p!.deeds[i]!.from).toBe(p!.deeds[i - 1]!.to);
      }
    }
  });

  it.each([1, 2, 3])('owning property beyond your own home is for the few (seed %i)', (seed) => {
    const w = createWorld(data, seed);
    for (let d = 0; d < 100; d++) tick(w, data);
    const count = new Map<number, number>();
    for (const p of Object.values(w.property)) if (p.owner !== null) count.set(p.owner, (count.get(p.owner) ?? 0) + 1);
    const landlords = [...count.values()].filter((n) => n > 1).length;
    expect(landlords).toBeGreaterThan(0);
    expect(landlords / w.citizens.filter((c) => c.alive).length).toBeLessThanOrEqual(0.05);
  });

  it('property changes hands on the market: each buyer pays the seller the deed price, and no coin is made or lost', () => {
    const w = createWorld(data, 1);
    const start = totalCoins(w);
    for (let d = 0; d < 100; d++) tick(w, data);
    const sales = Object.entries(w.property).flatMap(([key, p]) => p.deeds.filter((d) => d.day > 0 && d.from !== null).map((d) => ({ key, d })));
    expect(sales.length).toBeGreaterThan(0);
    for (const { key, d } of sales) {
      // (A house re-let to a new household is renamed, so match on who paid whom, when, for property.)
      const paid = w.ledger.find((e) => e.day === d.day && e.memo.startsWith('buying ') && e.amount === d.price && e.to === w.citizens[d.from!]!.key && e.from === w.citizens[d.to!]!.key);
      expect(paid?.amount, `${key} on day ${d.day}`).toBe(d.price);
    }
    expect(totalCoins(w)).toBe(start);
  });
});
