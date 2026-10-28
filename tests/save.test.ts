// Saving and loading: a saved town carries on exactly as if it had never stopped, and compacting keeps it small
// without changing what happens next.
import { describe, expect, it } from 'vitest';
import { compact, createWorld, loadData, loadWorld, saveWorld, tick, totalCoins } from '../sim/index';

const data = loadData();

describe('save and load', () => {
  it('a saved and reloaded town carries on exactly as the original', () => {
    const a = createWorld(data, 5);
    for (let d = 0; d < 40; d++) tick(a, data);
    const b = loadWorld(saveWorld(a, 'Testford'))!.world;
    for (let d = 0; d < 30; d++) { tick(a, data); tick(b, data); }
    expect(b.citizens.map((c) => [c.alive, c.coins, c.trade])).toEqual(a.citizens.map((c) => [c.alive, c.coins, c.trade]));
    expect(b.rngState).toBe(a.rngState);
  });

  it('compacting daily keeps a long-played town small, keeps every coin, and does not change what happens', () => {
    const a = createWorld(data, 6);
    const b = createWorld(data, 6);
    const start = totalCoins(b);
    for (let d = 0; d < 150; d++) { tick(a, data); tick(b, data); compact(b); }
    expect(b.citizens.map((c) => c.coins)).toEqual(a.citizens.map((c) => c.coins));
    expect(totalCoins(b)).toBe(start);
    const kb = saveWorld(b, 'Testford').length / 1024;
    expect(kb).toBeLessThan(1200);
    // Anything still held can still be traced to its makers.
    for (const c of b.citizens) for (const lot of c.inventory) expect(b.batches.has(lot.batch)).toBe(true);
  });
});
