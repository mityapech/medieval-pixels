// Core data types for the simulation. Pure data: no graphics, no input.

export type GoodId = string;
export type CitizenId = number;
export type BatchId = number;
export type Trade = 'farmer' | 'baker' | 'lumberjack' | 'miner' | 'forager' | 'fisherman' | 'builder' | 'innkeeper' | 'blacksmith' | 'merchant';

export const TRADES: readonly Trade[] = ['farmer', 'baker', 'lumberjack', 'miner', 'forager', 'fisherman', 'builder', 'innkeeper', 'blacksmith', 'merchant'];

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
  granary: {
    goods: GoodId[];
    /** Units of each good the authority tries to keep in store. */
    targetUnits: number;
    /** Buys only when a producer asks no more than basePrice times this. */
    buyBelow: number;
    /** Share of the treasury above its wage reserve it will spend on stores in a day. */
    budgetShare: number;
    /** Share of targetUnits already in store at the start. */
    startShare: number;
  };
  comfort: { thresholdDays: number; spendShare: number; basket: Record<GoodId, number> };
  health: {
    illnessPerYear: number;
    sickDays: [number, number];
    recoverPerDay: number;
    /** Added to the daily chance of recovering when the town has a healer. */
    healerRecoverBonus: number;
    /** Daily chance a sick person dies: young (under 5), adult, old (60 and over). */
    deathPerSickDay: { young: number; adult: number; old: number };
    /** A healer multiplies that chance by this. */
    healerDeathFactor: number;
  };
  /** Evenings at the tavern: those who can spare it drink a couple of ales with company. */
  tavern: { alePerVisit: number; visitAboveDays: number; visitChance: number };
  /** Ageing, births, old age and marriage. A year passes every yearDays days. */
  growth: {
    yearDays: number;
    birthsPerCouplePerYear: number;
    fertileAges: [number, number];
    oldAgeFrom: number;
    /** Each year past oldAgeFrom adds this much to the yearly chance of dying of old age. */
    oldAgeRiskPerYearOver: number;
    marriagesPerSinglePerYear: number;
    marryAges: [number, number];
  };
  property: {
    /** Share of households (the richest) whose heads are burghers, owning the town's businesses and houses to let. */
    burgherShare: number;
    /** Share of households (the next richest) that own the house they live in. */
    ownHomeShare: number;
    /** A house's daily rent, in meals at current food prices, per tile of floor. */
    rentPerTileMeals: number;
    /** Share of a worker's daily sales paid to the owner of the site they work at. */
    siteFeeShare: number;
    /** A property is worth about this many days of what it earns. */
    paybackDays: number;
    /** An owner sells property when their household has less than this many days of food in coins. */
    sellWhenShortDays: number;
    /** Households with more than this many days of living costs to spare may buy property. */
    buyAboveDays: number;
    /** An unsold property's asking price falls by this factor each day. */
    markdownPerDay: number;
    reviewEveryDays: number;
    /** A burgher develops when their savings cover this many days of living costs beyond the building cost. */
    developAboveDays: number;
    /** An employee's daily wage, in meals. */
    wageMeals: number;
    /** Landlords raise or lower rent by this factor as demand changes. */
    rentStep: number;
    /** The town sells an empty plot for this many meals. */
    plotPriceMeals: number;
    /** An owner accepts an unasked-for offer at this many times what the property is worth to them. */
    sellAbove: number;
    /** Households with more than this many days of living costs to spare make offers on property. */
    investAboveDays: number;
  };
  /** Buildings wear down each day; their owners pay builders to repair them with these materials. */
  construction: {
    materials: Record<GoodId, number>;
    repairBelow: number;
    repairAmount: number;
    decayPerDay: { home: number; public: number };
    /** A builder's day of labour is worth this many meals at current food prices. */
    labourMeals: number;
    newHouseMaterials: Record<GoodId, number>;
    newHouseDays: number;
  };
  service: {
    /** A servant's daily wage, in meals at the current cheapest food price. */
    wageMeals: number;
    /** A household takes on another servant only if its spare savings cover this many days of the wage. */
    affordDays: number;
    /** A household this size or larger may keep a second servant; smaller ones keep at most one. */
    membersForSecond: number;
  };
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
  /** Share of their savings above comfort a well-off person will give at most to one hungry household in a day. */
  charityShare: number;
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
  jobChange: {
    everyDays: number;
    /** People judge what a trade earns over this many days (their coins then versus now). */
    judgeOverDays: number;
    chance: number;
    minGain: number;
    quitWhenSavedDays: number;
    /** How many practitioners of each trade a person knows of when judging what it earns. */
    acquaintances: number;
  };
  authority: {
    startTreasury: number;
    startChurch: number;
    marketTax: number;
    /** Share per day of a household's savings above hearthTaxAboveDays of food. */
    hearthTaxShare: number;
    hearthTaxAboveDays: number;
    /** Days of wages the treasury keeps before passing surplus to the church. */
    treasuryKeepDays: number;
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
    /** The town wants about one guard per this many people, and one priest per peoplePerPriest. */
    peoplePerGuard: number;
    peoplePerPriest: number;
    peoplePerHealer: number;
    pupilsPerTeacher: number;
    schoolAges: [number, number];
    teacherWage: number;
    healerWage: number;
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
    /** How strongly a neighbour's prices follow its coins: price level = (coins / startCoins) ^ this. */
    moneyElasticity: number;
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

/** Anything that can hold goods: a citizen, or the town granary. */
export interface Holder {
  name: string;
  inventory: Lot[];
}

/** Anything that can hold coins: a citizen, the treasury, the church, a neighbouring town. */
export interface Account {
  /** Unique across the world, e.g. "citizen:12", "treasury", "town:Ashford". */
  key: string;
  name: string;
  coins: number;
}

export type Office = 'guard' | 'priest' | 'teacher' | 'healer' | 'servant';

export interface Citizen extends Account, Holder {
  id: CitizenId;
  /** Fixed in v0 (aging is out of scope). */
  age: number;
  traits: string[];
  /** null for anyone not in a trade: children, elders, unemployed adults, and office holders. */
  trade: Trade | null;
  /** A paid post: guard or priest with the town authority, or servant in a household. */
  office: Office | null;
  /** For merchants: the group of goods they deal in (see sim/specialities.ts). */
  speciality?: string;
  /** What this worker made today: one entry per recipe run. */
  workLog?: { recipe: string; qty: number }[];
  /** Where this worker works (a place key); unset means their trade's first site. */
  workplace?: string;
  /** Employed by a business owner: what they make belongs to the employer, who pays them a daily wage. */
  employer?: CitizenId;
  /** For servants: the household that employs them. */
  employerHousehold: HouseholdId | null;
  householdId: HouseholdId;
  spouseId: CitizenId | null;
  parentIds: CitizenId[];
  /** Placeholder until the land milestone. */
  home: string;
  inventory: Lot[];
  needs: { daysHungry: number; daysCold: number; sleep: number };
  /** Days of illness left (0 or absent when well). The sick cannot work. */
  sick?: number;
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
    /** Merchants: goods brought in from or sent out to other towns today, and producers visited. */
    imported?: Record<GoodId, number>;
    exported?: Record<GoodId, number>;
    visited?: number;
    /** Builders: the building they worked on today. */
    job?: string;
    /** Spent the evening at the tavern. */
    tavern?: boolean;
    /** Coins taken from sales today. */
    revenue?: number;
  };
  /** Coins at the start of each of the last days, used for job decisions. */
  coinHistory: number[];
  /** Things that happened to this citizen, most recent last, which they may talk about. */
  memories: Memory[];
}

export interface Memory {
  day: number;
  kind: string;
  params: Record<string, string | number>;
}

/** A short exchange between two citizens, at a place a viewer could be near. */
export interface Conversation {
  day: number;
  /** "market", "church", "home:<householdId>" or "work:<trade>". */
  place: string;
  placeLabel: string;
  topic: string;
  participants: [CitizenId, CitizenId];
  lines: { speaker: CitizenId; text: string }[];
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

export type Terrain = 'grass' | 'water' | 'forest' | 'rock';

/** A building or site on the map, in tiles. Keys: "market", "church", "granary", "work:<trade>", "home:<household id>". */
export interface Place {
  key: string;
  label: string;
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The generated land: a tile grid (row by row), road tiles, and every building's place. */
export interface Land {
  width: number;
  height: number;
  terrain: Terrain[];
  /** Tile indexes (y * width + x) that are road. */
  roads: number[];
  /** Road tiles inside the town wall, laid as wooden boardwalks. */
  boardwalks: number[];
  /** Tiles of the town wall, and the gates where roads pass through it. */
  walls: number[];
  gates: number[];
  /** Wooden piers out into the lake. */
  docks: number[];
  /** Whether water runs through the town (the canal). */
  river: boolean;
  places: Place[];
}

/** Who owns a building or site, its record of sales, and what it earns. Keyed by place key. */
export interface Property {
  /** null: the town (market square, church, granary, school, infirmary). */
  owner: CitizenId | null;
  kind: 'home' | 'business' | 'town';
  /** Every change of hands: who sold, who bought, for how much, when. The first entry is the founding grant. */
  deeds: { day: number; from: CitizenId | null; to: CitizenId | null; price: number }[];
  /** Homes: rent per day asked of the household living there (0 for one its owner lives in). */
  rent: number;
  /** Homes: rent the tenants could not pay (owed to the owner). */
  arrears: number;
  /** Businesses: the trade worked there, its name, and the speciality it is known for. */
  trade?: Trade;
  name?: string;
  niche?: string;
  /** Up for sale at this asking price, since this day. */
  forSale?: { asking: number; since: number };
}

/** Something a burgher is having built: a house to let or a new business, paid for day by day. */
export interface Project {
  key: string;
  owner: CitizenId;
  kind: 'home' | 'business';
  trade?: Trade;
  progress: number;
  days: number;
}

export interface ActiveEvent {
  id: string;
  name: string;
  endsOnDay: number;
  /** Who it struck, when it struck one household (a house fire). */
  family?: string;
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

/** A merchant's public advert: cried in the market and posted on the town notice board. */
export interface Advert {
  merchant: CitizenId;
  name: string;
  speciality: string;
  text: string;
  goods: { good: GoodId; qty: number; price: number; origin?: string }[];
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
  servants: number;
  /** Working-age adults with neither a trade nor a post. */
  unemployed: number;
  workingAge: number;
  alms: number;
  /** Units held in the public granary. */
  granary: number;
  imports: number;
  exports: number;
  eventsStarted: string[];
  eventsActive: string[];
  alive: number;
  broke: number;
  /** Coins spent today on comforts by well-off households. */
  comfortSpending: number;
  starved: { id: CitizenId; name: string }[];
  born: { id: CitizenId; name: string }[];
  diedOfAge: { id: CitizenId; name: string; age: number }[];
  diedOfIllness: { id: CitizenId; name: string; age: number }[];
  fellIll: number;
  /** People who spent the evening at the tavern. */
  tavernGoers: number;
  married: string[];
  /** Sales of property today: what, who to whom, and the price. */
  propertySales: string[];
  /** Rent and site fees paid today. */
  rentPaid: number;
  jobChanges: { id: CitizenId; name: string; from: Trade | null; to: Trade | null; reason: string }[];
  /** Deaths, new heads, children moving to kin: family events worth printing. */
  familyEvents: string[];
  /** Units made in town today, by good (imports not included). */
  produced: Record<GoodId, number>;
  conversations: Conversation[];
  adverts: Advert[];
  households: number;
  ages: { children: number; adults: number; elders: number };
  /** Coins per living household: median, mean, and the shares held by the richest 3 and the poorer half. */
  wealth: { median: number; mean: number; top3Share: number; poorHalfShare: number };
  /** People in each occupation: the five trades, guard, priest, servant, and unemployed working-age adults. */
  jobs: Record<string, number>;
  /** Coins moved today by kind. */
  flows: { tax: number; churchAlms: number; charity: number; kinSupport: number; servantWages: number; granary: number };
}

export interface World {
  day: number;
  seed: number;
  rngState: number;
  citizens: Citizen[];
  households: Household[];
  /** Terrain, roads and buildings, generated from the seed (see sim/land.ts). */
  land: Land;
  /** Who owns every building and site (see sim/property.ts). */
  property: Record<string, Property>;
  /** Buildings burghers are having built. */
  projects: Project[];
  /** Married couples still living apart, waiting for a house to rent. */
  waiting: { a: CitizenId; b: CitizenId }[];
  /** Condition of each building (0 ruined, 100 new), by place key. See sim/construction.ts. */
  buildings: Record<string, { condition: number }>;
  treasury: Account;
  /** The town's public store of grain and vegetables, bought cheaply in good times and sold at cost in a shortage. */
  granary: Holder;
  church: Account;
  neighbours: Neighbour[];
  events: ActiveEvent[];
  /** Every conversation so far, oldest first. */
  conversations: Conversation[];
  /** Separate random stream for conversations, so talk never changes the economy. */
  talkRngState: number;
  /** Buyer and seller pairs who traded today, who may stop to talk. */
  meetings: [CitizenId, CitizenId][];
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
