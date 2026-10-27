// Prints a generated town as a text map: ~ water, ^ forest, # rock, = road, : boardwalk, O wall, g gate, d dock,
// letters for buildings (h house, T townhouse).
// Usage: npx vite-node scripts/map.ts [seed]
import { createWorld, loadData } from '../sim/index';
const data = loadData();
const w = createWorld(data, Number(process.argv[2] ?? 1));
const { width, height, terrain, roads, places } = w.land;
const grid = terrain.map((t) => ({ grass: '.', water: '~', forest: '^', rock: '#' })[t]);
for (const r of roads) grid[r] = '=';
for (const r of w.land.boardwalks) grid[r] = ':';
for (const r of w.land.walls) grid[r] = 'O';
for (const r of w.land.gates) grid[r] = 'g';
for (const r of w.land.docks) grid[r] = 'd';
const mark = (key: string) => key === 'market' ? 'M' : key === 'church' ? 'C' : key === 'granary' ? 'G' : key.startsWith('home:') ? 'h'
  : ({ 'work:farmer': 'F', 'work:laborer': 'W', 'work:baker': 'B', 'work:blacksmith': 'S', 'work:merchant': 'R' } as Record<string, string>)[key] ?? '?';
for (const p of places) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) grid[y * width + x] = p.sprite === 'townhouse' ? 'T' : mark(p.key);
for (let y = 0; y < height; y++) console.log(grid.slice(y * width, (y + 1) * width).join(''));
console.log(`seed ${w.seed}: river ${w.land.river}, ${places.filter((p) => p.key.startsWith('home:')).length} homes for ${w.households.length} households`);
