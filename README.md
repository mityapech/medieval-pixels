# Medieval town simulation

A simulated medieval town of about 60 people in families, with five trades, a market, a town authority,
a church, random events and neighbouring towns. The rules are in [DESIGN.md](DESIGN.md).

```bash
npm install
npm run dev          # town view at http://localhost:5173, stats at /stats.html
npm run sim -- --days 100 --seed 1 --talk 3   # run in the terminal, printing conversations
npm test             # coins never change, nobody starves, talk never changes the economy
```

- `sim/` the simulation (no graphics or input code). `sim/index.ts` is what the rest may use.
- `render/` the town view (`render/game`, PixiJS placeholder graphics) and the stats page (`render/stats`, Chart.js).
- `data/` goods, recipes, town settings, traits and names, events, dialogue lines, sprite names.
- `tests/` and `scripts/` (survey, sweep and health tools for checking balance across many seeds).
