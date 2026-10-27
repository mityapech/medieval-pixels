// Loads goods, recipes, traits and town settings from data/ and checks they fit together.
import goodsJson from '../data/goods.json';
import townJson from '../data/town.json';
import traitsJson from '../data/traits.json';
import eventsJson from '../data/events.json';
import type { EventDef, GoodDef, GoodId, RecipeDef, TownConfig, Trade, TraitDef } from './types';
import { TRADES } from './types';

export interface GameData {
  goods: Map<GoodId, GoodDef>;
  recipes: RecipeDef[];
  recipesByTrade: Record<Trade, RecipeDef[]>;
  traits: Map<string, TraitDef>;
  firstNames: string[];
  familyNames: string[];
  town: TownConfig;
  events: EventDef[];
}

export function loadData(): GameData {
  const goods = new Map<GoodId, GoodDef>();
  for (const g of goodsJson.goods as unknown as GoodDef[]) goods.set(g.id, g);
  const recipes = goodsJson.recipes as unknown as RecipeDef[];
  const town = townJson as unknown as TownConfig;

  const recipesByTrade = Object.fromEntries(TRADES.map((t) => [t, [] as RecipeDef[]])) as Record<Trade, RecipeDef[]>;
  for (const r of recipes) {
    if (!TRADES.includes(r.trade)) throw new Error(`recipe ${r.id}: unknown trade ${r.trade}`);
    for (const g of [...Object.keys(r.inputs), ...Object.keys(r.outputs), ...(r.tool ? [r.tool] : [])]) {
      if (!goods.has(g)) throw new Error(`recipe ${r.id}: unknown good ${g}`);
    }
    if (r.tool && goods.get(r.tool)!.kind !== 'tool') throw new Error(`recipe ${r.id}: ${r.tool} is not a tool`);
    recipesByTrade[r.trade].push(r);
  }
  for (const g of goods.values()) {
    if (g.kind === 'tool' && !g.durability) throw new Error(`tool ${g.id} needs a durability`);
    if (g.kind === 'food' && !g.nutrition) throw new Error(`food ${g.id} needs nutrition`);
  }
  const shares = TRADES.reduce((n, t) => n + town.trades[t].share, 0);
  if (Math.abs(shares - 1) > 0.001) throw new Error(`trade shares add up to ${shares}, not 1`);
  for (const need of town.householdNeeds) if (!goods.has(need.good)) throw new Error(`household need: unknown good ${need.good}`);

  const events = eventsJson.events as unknown as EventDef[];
  for (const e of events) {
    for (const r of Object.keys(e.recipeOutput ?? {})) if (!recipes.some((x) => x.id === r)) throw new Error(`event ${e.id}: unknown recipe ${r}`);
    for (const g of [...Object.keys(e.householdNeed ?? {}), ...Object.keys(e.neighbourPrice ?? {})]) {
      if (!goods.has(g)) throw new Error(`event ${e.id}: unknown good ${g}`);
    }
  }

  return {
    events,
    goods,
    recipes,
    recipesByTrade,
    traits: new Map((traitsJson.traits as unknown as TraitDef[]).map((t) => [t.id, t])),
    firstNames: traitsJson.firstNames,
    familyNames: traitsJson.familyNames,
    town,
  };
}
