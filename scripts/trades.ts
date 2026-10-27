// How many people work each trade over time, and what a typical worker in it earned that week (median net coins).
// Usage: npx vite-node scripts/trades.ts [seed] [days]
import { createWorld, loadData, tick } from '../sim/index';
import { TRADES } from '../sim/types';
const [seed = 1, days = 100] = process.argv.slice(2).map(Number);
const data = loadData();
const w = createWorld(data, seed);
console.log('day  ' + TRADES.map((t) => t.slice(0, 6).padStart(12)).join(''));
for (let d = 1; d <= days; d++) {
  tick(w, data);
  if (d % Number(process.env.EVERY ?? 10)) continue;
  const cells = TRADES.map((t) => {
    const ws = w.citizens.filter((c) => c.alive && c.trade === t);
    const nets = ws.filter((c) => c.coinHistory.length).map((c) => c.coins - c.coinHistory[0]!).sort((a, b) => a - b);
    const med = nets.length ? nets[Math.floor(nets.length / 2)]! : 0;
    return `${ws.length} (${med >= 0 ? '+' : ''}${med})`.padStart(12);
  });
  console.log(String(d).padStart(4) + ' ' + cells.join(''));
}
