// Daily life: plans and adverts describe the day without changing it, and merchants keep to their specialities.
import { describe, expect, it } from 'vitest';
import routines from '../data/routines.json';
import { createWorld, dayPlan, loadData, runDays, specialityOf, tick } from '../sim/index';

const data = loadData();
const WHERE = new Set(['work', 'home', 'market', 'church', 'granary', 'docks', 'gate', 'wall', 'canal', 'play', 'employer', 'lake', 'site', 'school', 'infirmary']);

describe('day plans', () => {
  it('every recipe has steps, and every step names a known kind of place', () => {
    for (const r of data.recipes) expect((routines.recipeSteps as Record<string, unknown[]>)[r.id], r.id).toBeDefined();
    const all = JSON.stringify(routines).match(/"where":\s*"(\w+)"/g)!.map((m) => m.split('"')[3]!);
    for (const w of all) expect(WHERE).toContain(w);
  });

  it('gives every living person something to do, and workers the steps of what they made', () => {
    const w = createWorld(data, 2);
    runDays(w, data, 10);
    for (const c of w.citizens.filter((x) => x.alive)) {
      const plan = dayPlan(w, data, c);
      expect(plan.length, c.name).toBeGreaterThan(0);
      if (c.trade && c.trade !== 'merchant' && c.trade !== 'builder' && c.workLog?.length && !c.sick) {
        expect(plan[0]!.task).toBe((routines.recipeSteps as Record<string, { task: string }[]>)[c.workLog[0]!.recipe]![0]!.task);
      }
    }
  });

  it('does not change the economy: same results with or without asking for plans', () => {
    const a = createWorld(data, 4);
    const b = createWorld(data, 4);
    for (let d = 0; d < 20; d++) {
      tick(a, data);
      tick(b, data);
      for (const c of b.citizens) dayPlan(b, data, c);
    }
    expect(b.citizens.map((c) => c.coins)).toEqual(a.citizens.map((c) => c.coins));
    expect(b.rngState).toBe(a.rngState);
  });
});

describe('merchants', () => {
  it('each has a speciality, and their adverts are cried with prices', () => {
    const w = createWorld(data, 1);
    let adverts = 0;
    for (let d = 0; d < 30; d++) {
      const r = tick(w, data);
      for (const a of r.adverts) {
        adverts++;
        expect(Object.keys(routines.merchantSpecialities)).toContain(a.speciality);
        expect(a.text.length).toBeGreaterThan(5);
        expect(a.goods[0]!.price).toBeGreaterThan(0);
      }
    }
    expect(adverts).toBeGreaterThan(0);
    for (const m of w.citizens.filter((c) => c.alive && c.trade === 'merchant')) expect(Object.keys(routines.merchantSpecialities)).toContain(specialityOf(w, m));
  });
});
