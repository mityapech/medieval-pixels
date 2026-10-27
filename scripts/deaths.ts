// Profiles each death: the household's size, earners and purse, and how much richer kin elsewhere had.
import { kinOf, livingMembers } from '../sim/family';
import { createWorld, loadData, tick } from '../sim/index';
const data = loadData();
const rows: string[] = [];
const summary = { homes: new Map<string, { size: number; earners: number }>(), kinWithMoney: 0, total: 0 };
for (const seed of process.argv.slice(2).map(Number)) {
  const w = createWorld(data, seed);
  for (let d = 0; d < 100; d++) {
    const snap = new Map(w.households.map((h) => {
      const m = livingMembers(w, h);
      return [h.id, { size: m.length, earners: m.filter((c) => c.trade || c.office).length, purse: m.reduce((s, c) => s + c.coins, 0), adultsIdle: m.filter((c) => !c.trade && !c.office && c.age >= 12 && c.age < 60).length }];
    }));
    const r = tick(w, data);
    for (const s of r.starved) {
      const c = w.citizens[s.id]!;
      const h = snap.get(c.householdId)!;
      const kinCoins = Math.max(0, ...kinOf(w, c).filter((k) => k.person.householdId !== c.householdId).map((k) => k.person.coins));
      summary.total++;
      if (kinCoins > 50) summary.kinWithMoney++;
      summary.homes.set(`${seed}:${c.householdId}`, h);
      rows.push(`seed ${seed} day ${r.day} ${c.name} age ${c.age} ${c.trade ?? c.office ?? '-'} | home size ${h.size} earners ${h.earners} idle adults ${h.adultsIdle} purse ${h.purse} | richest kin elsewhere ${kinCoins}`);
    }
  }
}
console.log(rows.slice(0, 40).join('\n'));
const homes = [...summary.homes.values()];
console.log(`deaths ${summary.total}, in ${homes.length} households; avg size ${(homes.reduce((s, h) => s + h.size, 0) / homes.length).toFixed(1)}, avg earners ${(homes.reduce((s, h) => s + h.earners, 0) / homes.length).toFixed(1)}; deaths with kin holding >50 coins elsewhere: ${summary.kinWithMoney}`);
