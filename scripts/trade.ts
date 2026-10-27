// Imports and exports by good over a run, and the town's coins every 10 days.
import { createWorld, loadData, tick } from '../sim/index';
const data = loadData();
const seed = Number(process.argv[2] ?? 7);
const w = createWorld(data, seed);
const line: string[] = [];
for (let d = 1; d <= 100; d++) { const r = tick(w, data); if (d % 10 === 0) line.push(`${d}:${r.townCoins}`); }
const imp: Record<string, number> = {}, exp: Record<string, number> = {};
for (const e of w.ledger) {
  const m = e.memo.match(/^(import|export) (\d+) (\w+)/);
  if (m) { const t = m[1] === 'import' ? imp : exp; t[m[3]!] = (t[m[3]!] ?? 0) + e.amount; }
}
const memo = (prefix: string) => w.ledger.filter((e) => e.memo.startsWith(prefix)).reduce((s, e) => s + e.amount, 0);
console.log('town coins', line.join(' '));
console.log('imports', JSON.stringify(imp));
console.log('exports', JSON.stringify(exp));
console.log('servant wages', memo('servant wage'), 'alms', memo('alms'), 'kin support', memo('kin support'), 'hearth tax', memo('hearth tax'), 'market tax', memo('market tax'));
