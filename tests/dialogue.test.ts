// Conversations come from citizens' records and must never change what happens in the economy.
import { describe, expect, it } from 'vitest';
import { converse, createWorld, loadData, runDays } from '../sim/index';

const data = loadData();

describe('conversations', () => {
  it('only read the world: talking leaves dice, coins and goods untouched', () => {
    const world = createWorld(data, 4);
    runDays(world, data, 30);
    const snapshot = () => JSON.stringify({ rng: world.rngState, citizens: world.citizens.map((c) => [c.coins, c.inventory, c.prices, c.trade]) });
    const before = snapshot();
    for (let i = 0; i < 5; i++) converse(world, data);
    expect(snapshot()).toBe(before);
  });

  it('happen every day, between the two people named, with every blank filled in', () => {
    const world = createWorld(data, 9);
    runDays(world, data, 60);
    for (const r of world.reports) expect(r.conversations.length).toBeGreaterThan(0);
    for (const c of world.conversations) {
      expect(c.participants[0]).not.toBe(c.participants[1]);
      for (const line of c.lines) {
        expect(c.participants).toContain(line.speaker);
        expect(line.text).not.toMatch(/[{}]/);
        expect(line.text).toMatch(/^[A-Z"']/);
      }
    }
  });

  it('draw on what really happened to people', () => {
    const world = createWorld(data, 2);
    runDays(world, data, 100);
    const topics = new Set(world.conversations.map((c) => c.topic));
    // Memories, present troubles or hopes, and town events all come up over a hundred days.
    expect([...topics].some((t) => ['changed_job', 'started_work', 'entered_service', 'took_post', 'tool_broke', 'received_alms'].includes(t))).toBe(true);
    expect([...topics].some((t) => t.startsWith('hope_') || t === 'short_of_coin' || t.startsWith('prices_'))).toBe(true);
  });
});
