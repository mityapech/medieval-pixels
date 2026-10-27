// Core data types for the simulation. Pure data: no graphics, no input.

export type GoodId = string;
export type CitizenId = number;
export type BatchId = number;
export type Trade = 'farmer' | 'baker' | 'laborer' | 'blacksmith' | 'merchant';

export const TRADES: readonly Trade[] = ['farmer', 'baker', 'laborer', 'blacksmith', 'merchant'];

export interface GoodDef {
  id: GoodId;
  name: string;
  kind: 'crop' | 'food' | 'material' | 'tool';
  basePrice: number;
  weight: number;
  nutrition?: number;
  appeal?: number;
  durability?: number;
}

export interface RecipeDef {
  id: string;
  trade: Trade;
  inputs: Record<GoodId, number>;
  outputs: Record<GoodId, number>;
  tool?: GoodId;
  wear?: number;
  /** Fraction of output produced without the tool. */
  handFactor?: number;
}

export interface TraitDef {
  id: string;
  outputMult?: number;
  priceStepMult?: number;
  marginBonus?: number;
  extraVisits?: number;
  extraFoodDays?: number;
  jobChangeMult?: number;
}

export interface TradeConfig {
  share: number;
  startCoins: number;
  /** Coins needed beyond tools and inputs to start this trade (a merchant's stock money). */
  startCapital?: number;
  batchesPerDay: number;
  visitsPerDay?: number;
  carryCapacity?: number;
}

export interface HouseholdNeed {
  good: GoodId;
  perHouseholdPerDay: number;
  stockDays: number;
}

export interface TownConfig {
  population: number;
  /** Relative weights for household types when the town is generated. */
  householdKinds: Record<string, number>;
  /** Share of working adults starting in each trade. */
  trades: Record<Trade, TradeConfig>;
  workingAge: { adult: number; elder: number };
  /** Chance that a non-head adult works at the start. */
  secondEarnerChance: number;
  startCoins: { child: number; adult: number; elder: number };
  householdNeeds: HouseholdNeed[];
  /** Well-off households spend part of their savings above thresholdDays of living costs on comforts, used up the same day. */
  comfort: { thresholdDays: number; spendShare: number; basket: Record<GoodId, number> };
  startFoodDays: number;
  foodStockDays: number;
  daysUntilStarvation: number;
  producerVisitsPerDay: number;
  shopVisitsPerDay: number;
  outputStockBatches: number;
  /** Days of work inputs (and crops, for farmers) each worker starts with. */
  startInputDays: number;
  /** Days of work inputs a worker tries to keep in stock. */
  inputStockDays: number;
  /** Days of household food a worker keeps in coins before spending on business. */
  reserveDays: number;
  pricing: {
    soldOutStep: number;
    missedDemandStep: number;
    overstockStep: number;
    unsoldStep: number;
    minMargin: number;
    maxMargin: number;
    newStockMargin: number;
    merchantBuyBelow: number;
    merchantRiskShare: number;
    merchantMinMargin: number;
    memoryWeight: number;
  };
  jobChange: { everyDays: number; chance: number; minGain: number; quitWhenSavedDays: number };
  authority: {
    startTreasury: number;
    startChurch: number;
    marketTax: number;
    /** Coins per day from each household whose purse covers hearthTaxAboveDays of food. */
    hearthTax: number;
    hearthTaxAboveDays: number;
    guardWage: number;
    priestWage: number;
    /** Share of affordable posts given to guards (the rest to priests). */
    guardShare: number;
    /** Share of tax income the treasury commits to wages. */
    wageBudgetShare: number;
    /** Share of the treasury above a few weeks of wages given to the church each day. */
    churchGrantShare: number;
    reviewEveryDays: number;
    /** New posts of each kind filled per review at most. */
    maxHiresPerReview: number;
  };
  neighbours: {
    names: string[];
    startCoins: number;
    /** Each neighbour's prices start at basePrice times a random factor in this range. */
    priceSpread: [number, number];
    dailyDrift: number;
    /** Extra cost of the road, as a share of the price, each way. */
    roadCost: number;
    /** Merchants import when the town price beats the import cost by this margin. */
    importMargin: number;
    /** A merchant's fee on import orders, as a share of the import cost. */
    merchantFee: number;
  };
}

/**
 * A batch is one production run: who made it, from which input batches, and when.
 * Batches are never deleted, so any good can be traced back through its inputs.
 */
export interface Batch {
  id: BatchId;
  good: GoodId;
  qty: number;
  /** -1 for goods imported from a neighbouring town (see origin). */
  maker: CitizenId;
  origin?: string;
  recipe: string;
  inputs: { batch: BatchId; qty: number }[];
  day: number;
}

/** A holding of goods from one batch. Tools are always lots of qty 1 with their own durability. */
export interface Lot {
  batch: BatchId;
  good: GoodId;
  qty: number;
  /** What the holder paid (or spent making it) per unit. */
  unitCost: number;
  durability?: number;
}

/** Anything that can hold coins: a citizen, the treasury, the church, a neighbouring town. */
export interface Account {
  /** Unique across the world, e.g. "citizen:12", "treasury", "town:Ashford". */
  key: string;
  name: string;
  coins: number;
}

export type Office = 'guard' | 'priest';

export interface Citizen extends Account {
  id: CitizenId;
  /** Fixed in v0 (aging is out of scope). */
  age: number;
  traits: string[];
  /** null for anyone not in a trade: children, elders, unemployed adults, and office holders. */
  trade: Trade | null;
  /** A paid post with the town authority. */
  office: Office | null;
  householdId: HouseholdId;
  spouseId: CitizenId | null;
  parentIds: CitizenId[];
  /** Placeholder until the land milestone. */
  home: string;
  inventory: Lot[];
  needs: { daysHungry: number; daysCold: number; sleep: number };
  alive: boolean;
  diedOnDay?: number;
  /** Asking price for each good this citizen sells. */
  prices: Record<GoodId, number>;
  /** Prices this citizen has actually seen (moving average) and how often. */
  seen: Record<GoodId, { avg: number; count: number }>;
  /** Per-day bookkeeping, reset each morning. */
  today: {
    offered: Record<GoodId, number>;
    sold: Record<GoodId, number>;
    missed: Record<GoodId, number>;
  };
  /** Coins at the start of each of the last days, used for job decisions. */
  coinHistory: number[];
}

export type HouseholdId = number;

/** People who share a larder and a fire. The head's inventory is the household larder. */
export interface Household {
  id: HouseholdId;
  family: string;
  kind: string;
  headId: CitizenId;
  memberIds: CitizenId[];
}

export interface LedgerEntry {
  day: number;
  from: string;
  to: string;
  amount: number;
  memo: string;
}

export interface Neighbour extends Account {
  /** What the town pays for, or charges for, each good. Drifts daily. */
  prices: Record<GoodId, number>;
}

export interface ActiveEvent {
  id: string;
  name: string;
  endsOnDay: number;
}

export interface EventDef {
  id: string;
  name: string;
  /** Chance per day of starting while not already active. */
  chance: number;
  durationDays: [number, number];
  /** Output multipliers by recipe id. */
  recipeOutput?: Record<string, number>;
  /** Household need multipliers by good. */
  householdNeed?: Record<GoodId, number>;
  /** Neighbouring towns' price multipliers by good. */
  neighbourPrice?: Record<GoodId, number>;
  /** Multiplier on the cost of the road for imports and exports. */
  roadCost?: number;
  /** Share of a random household's stores destroyed when the event starts. */
  householdLoss?: number;
  /** Each guard cuts the event's effects by this share (up to all of it). */
  guardMitigation?: number;
}

export interface DayReport {
  day: number;
  /** Average price actually paid per good today (absent if nothing traded). */
  prices: Record<GoodId, number>;
  volume: Record<GoodId, number>;
  /** Every coin in the world: people, treasury, church and neighbouring towns. Never changes. */
  totalCoins: number;
  /** Coins held inside the town (people, treasury, church). Changes with imports and exports. */
  townCoins: number;
  treasury: number;
  church: number;
  guards: number;
  priests: number;
  /** Working-age adults with neither a trade nor a post. */
  unemployed: number;
  workingAge: number;
  alms: number;
  imports: number;
  exports: number;
  eventsStarted: string[];
  eventsActive: string[];
  alive: number;
  broke: number;
  /** Coins spent today on comforts by well-off households. */
  comfortSpending: number;
  starved: { id: CitizenId; name: string }[];
  jobChanges: { id: CitizenId; name: string; from: Trade | null; to: Trade | null; reason: string }[];
  /** Deaths, new heads, children moving to kin: family events worth printing. */
  familyEvents: string[];
}

export interface World {
  day: number;
  seed: number;
  rngState: number;
  citizens: Citizen[];
  households: Household[];
  treasury: Account;
  church: Account;
  neighbours: Neighbour[];
  events: ActiveEvent[];
  /** Yesterday's unmet demand by good ("food" for meals), which merchants try to import. */
  unmet: Record<string, number>;
  /** Coins taken in by the treasury over recent days, for deciding how many posts it can afford. */
  taxHistory: number[];
  batches: Map<BatchId, Batch>;
  nextBatchId: BatchId;
  ledger: LedgerEntry[];
  initialCoins: number;
  reports: DayReport[];
}
