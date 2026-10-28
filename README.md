# medieval-pixels

A game where you are given the ultimate freedom in a super-open world set in a medieval pixel town.

## ▶ Play it now: **[mityapech.github.io/medieval-pixels](https://mityapech.github.io/medieval-pixels/)**

Nothing to install. It runs in your web browser (Chrome, Firefox, Edge or Safari) on a computer.

> This is an early version: for now you watch the town live its life and walk among the people. Playing as a
> citizen yourself comes later.

---

## What you are looking at

A walled medieval town on a lake, about 100 people in real families. Every person has a job, a home, coins and a
day of work to do. Farmers plough and harvest, bakers knead and bake, fishermen row out before dawn, builders
repair houses, children play by the canal, and in the evening the tavern fills up. Prices rise and fall with
supply and demand, a few rich burghers own most of the property and everyone else rents, and the town grows or
struggles over the years. Every town is different: type a new number in **Seed** and press **New town**.

## How to play

| | |
|---|---|
| **Walk around** | `W` `A` `S` `D` or the arrow keys |
| **Zoom** | `+` and `−` |
| **Speed** | **Pause**, **1×**, **10×**, **60×** at the top (at 1×, a day lasts about 4 minutes) |
| **Skip to tomorrow** | **Step one day** |
| **See who someone is** | Click a person: their family, job, coins, worries and today's work |
| **See a building** | Click it: who owns it and what it is |
| **Where did this come from?** | In a person's details, click something they own to trace who made it |
| **Everyone in town** | **People** |
| **What's happening** | Bottom left: **Overheard nearby** (conversations near you), **Town news**, **Market notices** |
| **Charts and history** | **Town Ledger** (top right): population, wealth, prices, production over time |

Tips: people near you show what they are doing over their heads, with a bar for how far along they are. When
someone finishes a job, what they made floats up (`+5 bread`). Try **10×** speed to watch a whole day go by.

---

## Run it on your own computer (optional)

You only need this if you want to change the game or play offline.

1. **Install Node.js.** Go to [nodejs.org](https://nodejs.org), download the **LTS** version and install it like
   any other program (just keep pressing Next / Continue).
2. **Download the game.** On this page, press the green **Code** button, then **Download ZIP**. Unzip it
   (double-click the file).
3. **Open a terminal in the game folder.**
   - **Windows:** open the unzipped folder, click the address bar at the top, type `cmd` and press Enter.
   - **Mac:** open the **Terminal** app, type `cd ` (with a space after it), drag the unzipped folder onto the
     Terminal window, and press Enter.
4. **Install and start it.** Type these two lines, pressing Enter after each (the first takes a minute, once only):

   ```bash
   npm install
   npm run dev
   ```

5. **Open the game:** go to **<http://localhost:5173>** in your browser.

To stop it, go back to the terminal and press `Ctrl` + `C`. Next time you only need step 3 and `npm run dev`.

**Something went wrong?**

- *"npm is not recognized"* or *"command not found: npm"*: Node.js isn't installed yet, or the terminal was open
  before you installed it. Install it (step 1), then close the terminal and open a new one.
- *The page won't load*: make sure the terminal from step 4 is still open and says `Local: http://localhost:5173`.
  If it shows a different number (like `5174`), use that address instead.
- Still stuck? [Open an issue](https://github.com/mityapech/medieval-pixels/issues) and describe what you see.

---

## For developers

```bash
npm install
npm run dev                                       # the game at http://localhost:5173, charts at /stats.html
npm run sim -- --days 100 --seed 1 --talk 3       # run a town in the terminal, printing conversations
npm test                                          # the rules: coins never change, nobody starves, and more
npm run build                                     # the playable website, in dist/
```

Every push to `main` rebuilds the website and publishes it to GitHub Pages
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

- `sim/`: the simulation (no graphics or input code). `sim/index.ts` is what the rest may use.
- `render/`: the town view (`render/game`, PixiJS placeholder graphics) and the Town Ledger (`render/stats`, Chart.js).
- `data/`: goods, recipes, town settings, traits and names, events, dialogue, routines, business names, sprite names.
- `tests/` and `scripts/`: the rules, and tools for checking balance across many towns.

The rules of the world, and what is planned next, are in [DESIGN.md](DESIGN.md).
