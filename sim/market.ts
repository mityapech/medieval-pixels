// Trade phase. Producers bring their stock to the market square and merchants keep stalls there, so buyers
// see every offer. Merchants are the ones who walk out to producers and to other towns.
import {
  cheapestMeal, foodReserveCoins, foodStock, foodTarget, householdNeedTarget, householdSize, isFood, makesGood, observePrice, recipesOf,
  seenPrice, sellableQty, shopsForSelf, talent, traitSum, trait,
} from './agent';
import { transfer } from './coins';
import { remember } from './memory';
import { householdOf, isHead, kinOf, livingMembers } from './family';
import type { GameData } from './data';
import { addLot, averageCost, makeImportBatch, moveGoods, stockOf, takeGoods } from './inventory';
import { bestExport, bestImport } from './neighbours';
import { granaryPrice, marketTax, sellFromGranary } from './authority';
import { rankRecipes, workingTool } from './production';
import { random, shuffle } from './rng';
import { dealsIn } from './specialities';
import { policyOf } from './politics';
import type { Citizen, GoodId, Neighbour, World } from './types';

/** Everything the trade phase counts for the day's report. */
export interface DayTally {
  trades: Record<GoodId, { coins: number; qty: number }>;
  tax: number;
  comfort: number;
  imports: number;
  exports: number;
  /** Units people wanted but could not find or afford, by good ("food" for meals of any kind). */
  unmet: Record<string, number>;
}

export const FOOD = 'food';

export function newTally(): DayTally {
  return { trades: {}, tax: 0, comfort: 0, imports: 0, exports: 0, unmet: {} };
}

export function askPrice(seller: Citizen, good: GoodId): number {
  return Math.max(1, Math.round(seller.prices[good] ?? Infinity));
}

export function tradePhase(world: World, data: GameData, tally: DayTally): void {
  const living = world.citizens.filter((c) => c.alive);
  world.meetings = [];
  for (const c of living) {
    c.today = { offered: {}, sold: {}, missed: {} };
    for (const g of Object.keys(c.prices)) c.today.offered[g] = sellableQty(world, data, c, g);
  }
  for (const m of shuffle(world, living.filter((c) => c.trade === 'merchant'))) merchantRounds(world, data, m, tally);
  supportHouseholds(world, data);
  // Neediest households shop first, and everyone buys today's meals before anyone stocks up.
  const shoppers = shuffle(world, living.filter((c) => shopsForSelf(world, c)));
  const perHead = (c: Citizen) => foodStock(data, c) / Math.max(1, householdSize(world, c));
  shoppers.sort((a, b) => perHead(a) - perHead(b));
  const foods = [...data.goods.keys()].filter((g) => isFood(data, g));
  for (const buyer of shoppers) {
    const short = householdSize(world, buyer) - foodStock(data, buyer);
    if (short > 0) buyBest(world, data, buyer, foods, short, 0, tally, FOOD);
  }
  for (const buyer of shoppers) shop(world, data, buyer, tally);
  consignExports(world, data, tally);
  // Remembered until tomorrow, when merchants decide what to bring in from outside.
  world.unmet = tally.unmet;
}

function buy(world: World, data: GameData, buyer: Citizen, seller: Citizen, good: GoodId, qty: number, price: number, tally: DayTally): void {
  transfer(world, buyer, seller, qty * price, `${qty} ${good}`);
  tally.tax += marketTax(world, data, seller, qty * price);
  moveGoods(seller, buyer, good, qty, price);
  seller.today.sold[good] = (seller.today.sold[good] ?? 0) + qty;
  seller.today.revenue = (seller.today.revenue ?? 0) + qty * price;
  world.meetings.push([buyer.id, seller.id]);
  const s = (tally.trades[good] ??= { coins: 0, qty: 0 });
  s.coins += qty * price;
  s.qty += qty;
}

/** Who has a good on offer today: merchants' stalls and any producer who brought stock to the market square. */
function sellersToVisit(world: World, data: GameData, buyer: Citizen, good: GoodId): Citizen[] {
  return shuffle(world, world.citizens.filter((c) => c.alive && c !== buyer && c.prices[good] !== undefined
    && (c.trade === 'merchant' || makesGood(data, c, good) || sellableQty(world, data, c, good) > 0)));
}

/**
 * Buys up to qty units of any of the goods, best value first, without spending below keepCoins. Having the good
 * brought in from a neighbouring town is always one of the options (unless unmetKey is null), so local prices
 * cannot stay above what an import costs. Shortfalls count as unmet demand.
 */
export function buyBest(
  world: World, data: GameData, buyer: Citizen, goods: GoodId[], qty: number, keepCoins: number, tally: DayTally,
  unmetKey: string | null = goods[0]!,
): number {
  type Offer = { seller?: Citizen; good: GoodId; price: number; value: number; from?: Neighbour; unitCost?: number; granary?: boolean };
  const offers: Offer[] = [];
  // How much taste matters depends on what the household can spare: the comfortable pay for bread and tarts,
  // the poor go for whatever fills them most cheaply.
  const purse = livingMembers(world, householdOf(world, buyer)).reduce((s, m) => s + m.coins, 0);
  const taste = Math.min(1, purse / Math.max(1, comfortLine(world, data, buyer) * livingMembers(world, householdOf(world, buyer)).length));
  const appeal = (g: GoodId) => Math.pow(data.goods.get(g)!.appeal ?? 1, taste);
  const visited = new Set<Citizen>();
  for (const good of goods) {
    for (const seller of sellersToVisit(world, data, buyer, good)) visited.add(seller);
  }
  for (const seller of visited) {
    for (const good of goods) {
      if (seller.prices[good] === undefined) continue;
      if (sellableQty(world, data, seller, good) <= 0) continue;
      const price = askPrice(seller, good);
      observePrice(data, buyer, good, price);
      offers.push({ seller, good, price, value: price / appeal(good) });
    }
  }
  // In a shortage the public granary opens and sells at cost.
  for (const good of goods) {
    const price = granaryPrice(world, good);
    if (price !== undefined && shortHere(world, data, good)) offers.push({ good, price, value: price / appeal(good), granary: true });
  }
  if (unmetKey) {
    for (const good of goods) {
      const imp = bestImport(world, data, good);
      if (!imp) continue;
      // The import cost, the merchant's fee, and the mayor's tariff on goods from outside.
      const price = Math.ceil(imp.unitCost * (1 + data.town.neighbours.merchantFee + policyOf(world, data).tariff));
      offers.push({ good, price, value: price / appeal(good), from: imp.from, unitCost: imp.unitCost });
    }
  }
  // Local goods win ties.
  offers.sort((a, b) => a.value - b.value || Number(!!a.from) - Number(!!b.from));
  let bought = 0;
  let localShort = false;
  for (const o of offers) {
    if (bought >= qty) break;
    const afford = Math.floor((buyer.coins - keepCoins) / o.price);
    if (o.seller) {
      const n = Math.min(qty - bought, sellableQty(world, data, o.seller, o.good), afford);
      if (n <= 0) continue;
      buy(world, data, buyer, o.seller, o.good, n, o.price, tally);
      bought += n;
    } else if (o.granary) {
      const n = Math.min(qty - bought, stockOf(world.granary, o.good), afford);
      if (n <= 0) continue;
      sellFromGranary(world, buyer, o.good, n, o.price);
      const s = (tally.trades[o.good] ??= { coins: 0, qty: 0 });
      s.coins += n * o.price;
      s.qty += n;
      bought += n;
    } else {
      localShort = true;
      const n = Math.min(qty - bought, afford);
      if (n <= 0) continue;
      bought += importOrder(world, data, buyer, o.good, n, o.price, o.from!, o.unitCost!, tally);
    }
  }
  if (unmetKey && (bought < qty || localShort)) {
    // Producers who had none to sell hear that buyers went elsewhere or away empty-handed.
    for (const seller of visited) {
      for (const good of goods) {
        if (makesGood(data, seller, good) && sellableQty(world, data, seller, good) <= 0) seller.today.missed[good] = (seller.today.missed[good] ?? 0) + 1;
      }
    }
  }
  if (unmetKey && bought < qty) tally.unmet[unmetKey] = (tally.unmet[unmetKey] ?? 0) + qty - bought;
  return bought;
}

function shop(world: World, data: GameData, buyer: Citizen, tally: DayTally): void {
  // 1. Food for the whole household.
  const foods = [...data.goods.keys()].filter((g) => isFood(data, g));
  const hungry = foodTarget(world, data, buyer) - foodStock(data, buyer);
  if (hungry > 0) buyBest(world, data, buyer, foods, hungry, 0, tally, FOOD);
  // 2. Firewood and other household needs.
  for (const need of data.town.householdNeeds) {
    const short = householdNeedTarget(world, data, buyer, need.good) - stockOf(buyer, need.good);
    if (short > 0) buyBest(world, data, buyer, [need.good], short, 0, tally);
  }
  // 3. Comforts, if the household is well off: more firewood, finer food. Used up the same day.
  if (isHead(world, buyer)) tally.comfort += buyComforts(world, data, buyer, tally);
  if (!buyer.trade) return;

  const reserve = foodReserveCoins(world, data, buyer);
  // 4. Tools for the job, when the current one is nearly worn out. A tool multiplies a day's output,
  // so a worker will dig into savings for one, keeping back only a day of food.
  const tools = new Set(recipesOf(data, buyer).flatMap((r) => (r.tool ? [r.tool] : [])));
  const workReserve = Math.ceil(reserve / data.town.reserveDays);
  for (const tool of tools) {
    const t = workingTool(buyer, tool);
    if (!t || t.durability! <= 2) buyBest(world, data, buyer, [tool], 1, workReserve, tally);
  }
  // 5. Inputs for tomorrow's work. Only recipes expected to turn a profit are planned, and without
  // inputs there is no income at all, so these too may use savings down to a day of food.
  for (const [good, qty] of Object.entries(inputsWanted(world, data, buyer))) {
    if (qty > 0) buyBest(world, data, buyer, [good], qty, workReserve, tally);
  }
}

/** Inputs needed for tomorrow's best recipes, expanding goods the trade can make itself (a smith smelts its own ingots). */
export function inputsWanted(world: World, data: GameData, c: Citizen): Record<GoodId, number> {
  const recipes = recipesOf(data, c);
  const need: Record<GoodId, number> = {};
  // Keep a buffer of inputs for a couple of days' runs, spread over the best recipes.
  const ranked = rankRecipes(world, data, c, false);
  const runs = data.town.trades[c.trade!].batchesPerDay * data.town.inputStockDays;
  for (let i = 0; i < runs && ranked.length; i++) {
    const r = ranked[i % Math.min(ranked.length, 2)]!;
    for (const [g, q] of Object.entries(r.inputs)) need[g] = (need[g] ?? 0) + q;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const [g, q] of Object.entries(need)) {
      const maker = recipes.find((r) => r.outputs[g]);
      const short = q - stockOf(c, g);
      if (!maker || short <= 0) continue;
      need[g] = stockOf(c, g);
      const runs = Math.ceil(short / maker.outputs[g]!);
      for (const [ig, iq] of Object.entries(maker.inputs)) need[ig] = (need[ig] ?? 0) + iq * runs;
    }
  }
  const wanted: Record<GoodId, number> = {};
  for (const [g, q] of Object.entries(need)) {
    if (!recipes.some((r) => r.outputs[g])) wanted[g] = q - stockOf(c, g);
  }
  return wanted;
}

/**
 * A merchant's day: walk to a few producers and buy what is cheap compared with prices they have seen
 * (or what a neighbouring town would pay more for), sell slow stock abroad, and import what the town ran short of.
 */
function merchantRounds(world: World, data: GameData, m: Citizen, tally: DayTally): void {
  const cfg = data.town.trades.merchant;
  const { pricing } = data.town;
  const reserve = foodReserveCoins(world, data, m);
  const room = () => (cfg.carryCapacity ?? 0) - m.inventory.reduce((w, l) => w + l.qty * data.goods.get(l.good)!.weight, 0);
  const budget = () => Math.max(0, (m.coins - reserve) * pricing.merchantRiskShare);
  const producers = shuffle(world, world.citizens.filter((c) => c.alive && c.trade && c.trade !== 'merchant'));
  // A natural trader gets round more of the town's producers in a day.
  const visits = Math.round(((cfg.visitsPerDay ?? 0) + traitSum(data, m, 'extraVisits')) * talent(data, m, 'merchant'));
  m.today.visited = Math.min(visits, producers.length);
  for (const seller of producers.slice(0, visits)) {
    for (const good of Object.keys(seller.prices)) {
      const avail = sellableQty(world, data, seller, good);
      if (avail <= 0) continue;
      const price = askPrice(seller, good);
      const known = m.seen[good];
      // Only worth buying cheap if someone in town has been buying it lately.
      const wanted = (world.reports.at(-1)?.volume[good] ?? 0) > 0 || (world.unmet[good] ?? 0) > 0;
      const cheapHere = wanted && known && known.count >= 3 && price <= known.avg * pricing.merchantBuyBelow;
      const abroad = mayExport(world, data, good) ? bestExport(world, data, good, 1) : undefined;
      const worthExporting = abroad && abroad.unitPrice >= price * (1 + data.town.neighbours.importMargin);
      if (dealsIn(world, m, good) && (cheapHere || worthExporting)) {
        const n = Math.min(avail, Math.floor(budget() / price), Math.floor(room() / data.goods.get(good)!.weight));
        if (n > 0) {
          const fresh = stockOf(m, good) === 0;
          buy(world, data, m, seller, good, n, price, tally);
          const target = Math.max(price * pricing.newStockMargin, known?.avg ?? 0);
          m.prices[good] = fresh ? target : Math.max(m.prices[good] ?? 0, price * pricing.minMargin);
        }
      }
      observePrice(data, m, good, price);
    }
  }
  exportGoods(world, data, m, tally);
  importGoods(world, data, m, tally, room, budget);
}

/**
 * Has goods brought in from a neighbouring town: through a local merchant if there is one, otherwise a travelling
 * trader from that town, who keeps the fee there. The buyer pays the import cost plus the fee. Returns units delivered.
 */
function importOrder(
  world: World, data: GameData, buyer: Citizen, good: GoodId, n: number, price: number, from: Neighbour, unitCost: number, tally: DayTally,
): number {
  // The merchant who deals in this good takes the order if there is one; otherwise any merchant will.
  const all = world.citizens.filter((c) => c.alive && c.trade === 'merchant' && c !== buyer);
  const specialists = all.filter((c) => dealsIn(world, c, good));
  const merchants = specialists.length ? specialists : all;
  const m = merchants.length ? merchants[Math.floor(random(world) * merchants.length)]! : undefined;
  const tariff = Math.min(n * price, Math.floor(n * unitCost * policyOf(world, data).tariff));
  if (tariff > 0) { transfer(world, buyer, world.treasury, tariff, `tariff on ${n} ${good}`); tally.tax += tariff; }
  if (m) {
    note(m, 'imported', good, n);
    transfer(world, buyer, m, n * price - tariff, `order of ${n} ${good} from ${from.name}`);
    tally.tax += marketTax(world, data, m, n * price - tariff);
    transfer(world, m, from, n * unitCost, `import ${n} ${good}`);
  } else {
    transfer(world, buyer, from, n * price - tariff, `import ${n} ${good} via a travelling trader`);
  }
  const batch = makeImportBatch(world, good, n, from.name);
  const def = data.goods.get(good)!;
  if (def.kind === 'tool') {
    for (let i = 0; i < n; i++) addLot(buyer, { batch: batch.id, good, qty: 1, unitCost: price, durability: def.durability! });
  } else {
    addLot(buyer, { batch: batch.id, good, qty: n, unitCost: price });
  }
  observePrice(data, buyer, good, price);
  tally.imports += n * unitCost;
  const s = (tally.trades[good] ??= { coins: 0, qty: 0 });
  s.coins += n * price;
  s.qty += n;
  return n;
}

/**
 * After the market closes, producers holding more unsold goods than they keep in stock can consign the excess to a
 * merchant (or a travelling trader, if the town has none), who sells it in a neighbouring town and pays the producer
 * the takings less the fee. Nothing the town went short of is sent away.
 */
function consignExports(world: World, data: GameData, tally: DayTally): void {
  const merchants = world.citizens.filter((c) => c.alive && c.trade === 'merchant');
  const fee = data.town.neighbours.merchantFee;
  for (const p of world.citizens) {
    if (!p.alive || !p.trade || p.trade === 'merchant') continue;
    for (const r of recipesOf(data, p)) {
      for (const [good, q] of Object.entries(r.outputs)) {
        if (!mayExport(world, data, good)) continue;
        // Only the overstock that would otherwise stop them working (see outputTarget).
        const qty = Math.min(sellableQty(world, data, p, good), stockOf(p, good) - q * data.town.outputStockBatches);
        if (qty <= 0) continue;
        const deal = bestExport(world, data, good, qty);
        if (!deal) continue;
        const toProducer = Math.floor(deal.unitPrice * (1 - fee));
        const floor = (averageCost(p, good) ?? 0) * data.town.pricing.minMargin;
        if (toProducer < Math.max(1, floor)) continue;
        const specialists = merchants.filter((c) => dealsIn(world, c, good));
        const pool = specialists.length ? specialists : merchants;
        const m = pool.length ? pool[Math.floor(random(world) * pool.length)]! : undefined;
        if (m) {
          note(m, 'exported', good, qty);
          transfer(world, deal.to, m, qty * deal.unitPrice, `export ${qty} ${good}`);
          transfer(world, m, p, qty * toProducer, `consigned ${qty} ${good}`);
        } else {
          transfer(world, deal.to, p, qty * toProducer, `export ${qty} ${good} via a travelling trader`);
        }
        tally.tax += marketTax(world, data, p, qty * toProducer);
        takeGoods(p, good, qty);
        tally.exports += qty * deal.unitPrice;
      }
    }
  }
}

/** Whether a good may leave town: not if the town went short of it, nor food when the mayor bans food exports. */
function mayExport(world: World, data: GameData, good: GoodId): boolean {
  return !shortHere(world, data, good) && (policyOf(world, data).exportFood || !isFood(data, good));
}

/** Whether people in town went without this good yesterday (any food counts when meals ran short). */
function shortHere(world: World, data: GameData, good: GoodId): boolean {
  return (world.unmet[good] ?? 0) > 0 || (isFood(data, good) && (world.unmet[FOOD] ?? 0) > 0);
}

/** Sells to a neighbouring town anything that fetches more there than the merchant asks at home. */
function exportGoods(world: World, data: GameData, m: Citizen, tally: DayTally): void {
  for (const good of Object.keys(m.prices)) {
    const qty = sellableQty(world, data, m, good);
    if (qty <= 0 || !mayExport(world, data, good)) continue;
    const deal = bestExport(world, data, good, qty);
    const cost = averageCost(m, good) ?? Infinity;
    if (!deal || deal.unitPrice < Math.max(cost * data.town.pricing.minMargin, askPrice(m, good))) continue;
    transfer(world, deal.to, m, qty * deal.unitPrice, `export ${qty} ${good}`);
    note(m, 'exported', good, qty);
    takeGoods(m, good, qty);
    tally.exports += qty * deal.unitPrice;
  }
}

/**
 * Brings in what the town could not find yesterday. People who went without will pay, so the merchant
 * only needs the coins and the room to carry it. Each merchant covers a share of the shortfall.
 */
function importGoods(
  world: World, data: GameData, m: Citizen, tally: DayTally, room: () => number, budget: () => number,
): void {
  const merchants = world.citizens.filter((c) => c.alive && c.trade === 'merchant').length;
  for (const [key, short] of Object.entries(world.unmet).sort((a, b) => b[1] - a[1])) {
    const good = key === FOOD ? cheapestFoodImport(world, data) : key;
    if (!good || !dealsIn(world, m, good)) continue;
    const offer = bestImport(world, data, good);
    if (!offer) continue;
    const want = Math.ceil(short / merchants) - stockOf(m, good);
    const qty = Math.min(want, Math.floor(room() / data.goods.get(good)!.weight), Math.floor(budget() / offer.unitCost));
    if (qty <= 0) continue;
    transfer(world, m, offer.from, qty * offer.unitCost, `import ${qty} ${good}`);
    const duty = Math.min(m.coins, Math.floor(qty * offer.unitCost * policyOf(world, data).tariff));
    if (duty > 0) { transfer(world, m, world.treasury, duty, `tariff on ${qty} ${good}`); tally.tax += duty; }
    note(m, 'imported', good, qty);
    const batch = makeImportBatch(world, good, qty, offer.from.name);
    const def = data.goods.get(good)!;
    if (def.kind === 'tool') {
      for (let i = 0; i < qty; i++) addLot(m, { batch: batch.id, good, qty: 1, unitCost: offer.unitCost, durability: def.durability! });
    } else {
      addLot(m, { batch: batch.id, good, qty, unitCost: offer.unitCost });
    }
    m.prices[good] = Math.max(m.prices[good] ?? 0, offer.unitCost * data.town.pricing.newStockMargin);
    tally.imports += qty * offer.unitCost;
  }
}

function cheapestFoodImport(world: World, data: GameData): GoodId | undefined {
  let best: { good: GoodId; cost: number } | undefined;
  for (const g of data.goods.values()) {
    if (!isFood(data, g.id)) continue;
    const offer = bestImport(world, data, g.id);
    if (offer && (!best || offer.unitCost / g.nutrition! < best.cost)) best = { good: g.id, cost: offer.unitCost / g.nutrition! };
  }
  return best?.good;
}

/** Rest phase for sellers: raise prices that sold out, lower prices that did not sell. */
export function adjustPrices(world: World, data: GameData, c: Citizen): void {
  const { pricing } = data.town;
  const stepMult = trait(data, c, 'priceStepMult');
  const step = (s: number) => Math.pow(s, stepMult);
  for (const good of Object.keys(c.prices)) {
    let p = c.prices[good]!;
    const offered = c.today.offered[good] ?? 0;
    const sold = c.today.sold[good] ?? 0;
    const left = sellableQty(world, data, c, good);
    if (offered > 0 && sold > 0 && left === 0) p *= step(pricing.soldOutStep);
    else if ((c.today.missed[good] ?? 0) > 0 && left === 0) p *= step(pricing.missedDemandStep);
    else if (offered > 0 && sold === 0) {
      const overstocked = left > 2 * Math.max(1, ...recipesOf(data, c).map((r) => r.outputs[good] ?? 0));
      p *= overstocked ? pricing.overstockStep : pricing.unsoldStep;
    }
    // Price stays between cost plus a small margin and cost plus the largest margin buyers will bear.
    const cost = averageCost(c, good);
    if (cost !== undefined) {
      const bonus = traitSum(data, c, 'marginBonus');
      // Merchants will take a loss rather than carry goods nobody wants.
      const minMargin = c.trade === 'merchant' ? pricing.merchantMinMargin : pricing.minMargin + bonus;
      p = Math.min(Math.max(p, cost * minMargin), cost * (pricing.maxMargin + bonus));
    }
    c.prices[good] = Math.max(p, 1);
  }
  // Merchants forget goods they no longer carry.
  if (c.trade === 'merchant') {
    for (const g of Object.keys(c.prices)) if (stockOf(c, g) === 0) delete c.prices[g];
  }
}

/** When a head cannot afford the household's food and firewood, the other members chip in. */
function supportHouseholds(world: World, data: GameData): void {
  for (const h of world.households) {
    const head = world.citizens[h.headId]!;
    if (!head.alive) continue;
    let cost = Math.max(0, foodTarget(world, data, head) - foodStock(data, head)) * cheapestMeal(data, head);
    for (const need of data.town.householdNeeds) {
      cost += Math.max(0, householdNeedTarget(world, data, head, need.good) - stockOf(head, need.good)) * seenPrice(data, head, need.good);
    }
    let short = Math.ceil(cost) - head.coins;
    const members = livingMembers(world, h);
    const helpers = members.filter((m) => m !== head).sort((a, b) => b.coins - a.coins);
    for (const m of helpers) {
      if (short <= 0) break;
      const give = Math.min(m.coins, short);
      if (give > 0) transfer(world, m, head, give, 'household support');
      short -= give;
    }
    if (short <= 0) continue;
    // Still short: kin living elsewhere help, if their own household is comfortable.
    const kin = [...new Set(members.flatMap((m) => kinOf(world, m).map((k) => k.person)))].filter((k) => k.householdId !== h.id);
    for (const k of kin) {
      if (short <= 0) break;
      const spare = k.coins - comfortLine(world, data, k);
      const give = Math.min(Math.floor(spare), short);
      if (give > 0) {
        transfer(world, k, head, give, `kin support from ${k.name}`);
        remember(world, head, 'helped_by_kin', { name: k.name.split(' ')[0]!, relation: kinOf(world, head).find((x) => x.person === k)?.relation ?? 'kin' });
      }
      short -= Math.max(0, give);
    }
    // Someone here has already gone hungry: the comfortable give alms, as a matter of duty.
    if (short <= 0 || !members.some((m) => m.needs.daysHungry > 0)) continue;
    const givers = world.citizens.filter((g) => g.alive && g.householdId !== h.id && g.coins > comfortLine(world, data, g))
      .sort((a, b) => b.coins - comfortLine(world, data, b) - (a.coins - comfortLine(world, data, a)));
    for (const g of givers) {
      if (short <= 0) break;
      const give = Math.min(Math.floor((g.coins - comfortLine(world, data, g)) * data.town.charityShare), short);
      if (give > 0) {
        transfer(world, g, head, give, `alms from ${g.name}`);
        remember(world, head, 'received_alms', { giver: g.name });
        remember(world, g, 'gave_alms', { family: h.family });
      }
      short -= Math.max(0, give);
    }
  }
}

/** Coins a household keeps before it can spare any: comfort.thresholdDays of its food, shared over its members. */
export function comfortLine(world: World, data: GameData, c: Citizen): number {
  const members = livingMembers(world, householdOf(world, c));
  const daily = members.length * cheapestMeal(data, c) + seenPrice(data, c, 'wood');
  return (data.town.comfort.thresholdDays * daily) / Math.max(1, members.filter((m) => m.coins > 0).length);
}

/** Spends part of a well-off household's savings on comforts, used up the same day. Returns coins spent. */
function buyComforts(world: World, data: GameData, head: Citizen, tally: DayTally): number {
  const { comfort } = data.town;
  const members = livingMembers(world, householdOf(world, head));
  const daily = members.length * cheapestMeal(data, head) + seenPrice(data, head, 'wood');
  const purse = members.reduce((s, m) => s + m.coins, 0);
  const budget = (purse - comfort.thresholdDays * daily) * comfort.spendShare;
  if (budget <= 0) return 0;
  // Whoever in the household holds the most coins pays.
  const payer = [...members].sort((a, b) => b.coins - a.coins)[0]!;
  const keep = payer === head ? foodReserveCoins(world, data, head) : 0;
  const coinsBefore = payer.coins;
  for (const [good, share] of Object.entries(comfort.basket)) {
    const qty = Math.floor((budget * share) / seenPrice(data, payer, good));
    if (qty <= 0) continue;
    const got = buyBest(world, data, payer, [good], qty, keep, tally, null);
    if (got > 0) takeGoods(payer, good, got);
  }
  return coinsBefore - payer.coins;
}

/** Keeps a merchant's record of what went in and out of town today (for their day's tasks and adverts). */
function note(m: Citizen, kind: 'imported' | 'exported', good: GoodId, qty: number): void {
  const rec = (m.today[kind] ??= {});
  rec[good] = (rec[good] ?? 0) + qty;
}
