import { describe, expect, it } from 'vitest';
import { canMarry, createWorld, divorce, loadData, makeHead, marry, moveToFamily, renameCitizen, renameFamily, runDays, setCoins, totalCoins } from '../sim/index';
import { householdOf, isAdult } from '../sim/family';

const data = loadData();

describe("the player's powers", () => {
  it('gives and takes coins through the heavens, never creating any', () => {
    const world = createWorld(data, 7);
    const c = world.citizens.find((x) => x.alive)!;
    const start = totalCoins(world);
    expect(start).toBe(world.initialCoins);
    setCoins(world, c, c.coins + 500);
    setCoins(world, c, 3);
    expect(c.coins).toBe(3);
    expect(totalCoins(world)).toBe(start);
    expect(world.ledger.at(-1)!.to).toBe('heavens');
    expect(() => setCoins(world, c, world.heavens.coins + 10)).toThrow(/heavens hold only/);
    expect(() => setCoins(world, c, -1)).toThrow();
    runDays(world, data, 20);
    expect(totalCoins(world)).toBe(start);
  });

  it('renames people and families, and their house with them', () => {
    const world = createWorld(data, 7);
    const c = world.citizens[0]!;
    renameCitizen(world, c, '  Ragnar   Lothbrok ');
    expect(c.name).toBe('Ragnar Lothbrok');
    expect(() => renameCitizen(world, c, ' ')).toThrow();
    const h = householdOf(world, c);
    const old = h.family;
    renameFamily(world, h, 'Lothbrok');
    const label = world.land.places.find((p) => p.key === `home:${h.id}`)!.label;
    expect(label.startsWith('Lothbrok')).toBe(true);
    expect(label).not.toContain(old);
  });

  it('marries, parts and moves people, and the town carries on', () => {
    const world = createWorld(data, 11);
    const start = totalCoins(world);
    const a = world.citizens.find((x) => x.alive && isAdult(data, x) && canMarry(world, data, x).length > 0)!;
    const b = canMarry(world, data, a).find((x) => x.householdId !== a.householdId)!;
    marry(world, data, a, b);
    expect(a.spouseId).toBe(b.id);
    expect(b.householdId).toBe(a.householdId);
    expect(householdOf(world, a).memberIds).toContain(b.id);
    expect(() => marry(world, data, a, b)).toThrow();
    divorce(world, b);
    expect(a.spouseId).toBeNull();
    // Someone moves to another household, and becomes its head.
    const c = world.citizens.find((x) => x.alive && isAdult(data, x) && x.householdId !== a.householdId)!;
    const to = householdOf(world, a);
    moveToFamily(world, c, to);
    expect(c.householdId).toBe(to.id);
    expect(world.households.filter((h) => h.memberIds.includes(c.id))).toHaveLength(1);
    makeHead(world, data, c);
    expect(to.headId).toBe(c.id);
    runDays(world, data, 30);
    expect(totalCoins(world)).toBe(start);
  });
});
