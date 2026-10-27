// Runs many seeds and explains every death: was the household broke, or was there no food to buy?
// Usage: npx vite-node scripts/survey.ts [firstSeed] [lastSeed] [days]
import { cheapestMeal, foodStock, sellableQty, isFood } from '../sim/agent';
import { livingMembers } from '../sim/family';
import { createWorld, loadData, tick } from '../sim/index';

const [first = 1, last = 8, days = 100] = process.argv.slice(2).map(Number);
const data = loadData();
const foods = [...data.goods.keys()].filter((g) => isFood(data, g));
let allDeaths = 0;
for (let seed = first; seed <= last; seed++) {
  const w = createWorld(data, seed);
  const causes: Record<string, number> = {};
  let firstDeath = 0;
  let minMerchants = 99;
  let worstUnmetFood = 0;
  for (let d = 0; d < days; d++) {
    const purse = new Map(w.households.map((h) => [h.id, livingMembers(w, h).reduce((s, c) => s + c.coins, 0)]));
    const forSale = w.citizens.filter((c) => c.alive).reduce((s, c) => s + foods.reduce((a, g) => a + sellableQty(w, data, c, g), 0), 0);
    const r = tick(w, data);
    minMerchants = Math.min(minMerchants, w.citizens.filter((c) => c.alive && c.trade === 'merchant').length);
    worstUnmetFood = Math.max(worstUnmetFood, w.unmet.food ?? 0);
    for (const s of r.starved) {
      const c = w.citizens[s.id]!;
      const head = w.citizens[w.households[c.householdId]!.headId]!;
      const p = purse.get(c.householdId) ?? 0;
      const meal = cheapestMeal(data, head);
      const cause = p < meal * 2 ? 'broke' : forSale > 0 ? 'had money, food on sale' : 'had money, no food';
      causes[cause] = (causes[cause] ?? 0) + 1;
      if (!firstDeath) firstDeath = r.day;
    }
  }
  const dead = w.citizens.filter((c) => !c.alive).length;
  allDeaths += dead;
  const last = w.reports.at(-1)!;
  console.log(`seed ${seed}: dead ${dead} (first day ${firstDeath || '-'}) ${JSON.stringify(causes)} | min merchants ${minMerchants}, worst unmet food ${worstUnmetFood} | town ${last.townCoins}, treasury ${last.treasury}, church ${last.church}, idle ${last.unemployed}/${last.workingAge}`);
}
console.log(`total deaths: ${allDeaths}`);
