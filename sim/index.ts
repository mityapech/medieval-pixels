// Public entry point for the simulation. Rendering and input code must only use what is exported here.
export { loadData, type GameData } from './data';
export { createWorld } from './world';
export { tick, runDays } from './tick';
export { transfer, totalCoins } from './coins';
export { traceBatch } from './trace';
export { converse } from './dialogue';
export { dayPlan, employerOf, type Task } from './routine';
export { specialityOf } from './specialities';
// Read-only helpers the renderer uses to describe people and places.
export { cheapestMeal } from './agent';
export { householdOf, kinOf, livingMembers } from './family';
export { stockOf } from './inventory';
export type * from './types';
