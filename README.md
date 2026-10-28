# medieval-pixels

A cozy medieval town simulator where you are given the tools to observe and influence the rise (or fall) of a small medieval town with intricate economic mechanics.

## ▶ Play it now: **[mityapech.github.io/medieval-pixels](https://mityapech.github.io/medieval-pixels/)**

Nothing to install. It runs in your web browser (Chrome, Firefox, Edge or Safari) on a computer, tablet or phone.
On a phone: drag to move, pinch to zoom, tap anyone or any building, and **Town** for the market and money.

> This is an early version: for now you watch the town live its life and walk among the people. Playing as a
> citizen yourself comes later.

---

## What you are looking at

A walled medieval town on a lake, about 100 people in real families. Every person has a job, a home, coins and a
day of work to do. Farmers plough and harvest, bakers knead and bake, fishermen row out before dawn, builders
repair houses, children play by the canal, and in the evening the tavern fills up. Prices rise and fall with
supply and demand, a few rich burghers own most of the property and everyone else rents, and the town grows or
struggles over the years. Every two years the town elects a mayor, whose views change taxes, jobs, trade and
welfare. The mayor gives up their trade for the post and works at the Town Hall (look for the gold crown).

**One town, played slowly.** When you open the game you get a title screen over a slow timelapse of your town.
Press **Play** to found your town (give it a name) and it is saved in your browser: next time, **Continue** picks up
the same day. Founding a new town replaces the old one, so stay with the one you have and watch it rise or fall.

## How to play

| | |
|---|---|
| **Look around** | Drag the map, or `W` `A` `S` `D` / the arrow keys. You watch from above, like a god |
| **Zoom** | Scroll wheel (or `+` and `−`). Zoom in close to hear conversations and see what people are doing |
| **Speed** | **Pause**, **1×**, **10×**, **60×** at the top (at 1×, a day lasts 15 minutes; change it in Settings) |
| **Skip to tomorrow** | **Step one day** |
| **See who someone is** | Click a person: their family, job, coins, worries and today's work |
| **See a building** | Click it: who owns it and what it is. Click the **Town Hall** for the mayor's office |
| **Who owns what** | Click a landowner: every building they hold, who lives or works there, what each brings in a day and is worth |
| **Where did this come from?** | In a person's details, click something they own to trace who made it |
| **Everyone in town** | **People** |
| **What's happening** | Bottom left: **Overheard nearby** (conversations where you are looking), **Town news**, **Market notices** |
| **Charts and history** | **Ledger**: your town's population, wealth, prices and production since its founding |
| **Politics** | **Town Hall**: the mayor, their party, what they changed, their decrees, past mayors |
| **Elections** | Watch it live: candidates campaign at the market, voters walk in, the bars fill, the winner is cheered |
| **Play god** | Click a person, open **✦ Powers**: rename them or their family, set their coins, marry or part them, move them to another household, make them head of it |
| **Settings, save** | **Menu**: back to the title screen, settings (day length, start speed, labels). The town saves itself |

**Gifts and class.** Everyone is born with one of six work traits: *tough* (mining, woodcutting, building),
*green-fingered* (farming, foraging), *seafaring* (fishing), *deft* (smithing, baking), *charming* (the tavern) and
*greedy* (trading). A gifted worker makes up to 60–70% more, and people drift towards the work that suits them.
Labourers rarely get the chance to change trade, climbing to a craft or to trading takes a much bigger reason, and
well-off families would rather stay merchants and burghers than go back to labour.

Coins you give with ✦ Powers come from the heavens' purse (50,000 coins), and coins you take go back to it: no coin
is ever created or destroyed, even by you.

Tips: zoomed in, people on screen show what they are doing over their heads, with a bar for how far along they are. When
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
npm run dev                                       # the game at http://localhost:5173
npm run sim -- --days 100 --seed 1 --talk 3       # run a town in the terminal, printing conversations
npm test                                          # the rules: coins never change, nobody starves, and more
npm run build                                     # the playable website, in dist/
```

Every push to `main` rebuilds the website and publishes it to GitHub Pages
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

- `sim/`: the simulation (no graphics or input code). `sim/index.ts` is what the rest may use.
- `render/`: the town view (`render/game`, PixiJS placeholder graphics) and the Ledger (`render/ledger`, Chart.js), shown inside the game.
- `data/`: goods, recipes, town settings, traits and names, events, dialogue, routines, business names, sprite names.
- `tests/` and `scripts/`: the rules, and tools for checking balance across many towns.

The rules of the world, and what is planned next, are in [DESIGN.md](DESIGN.md).
