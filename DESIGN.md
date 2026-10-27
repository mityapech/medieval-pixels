# Medieval Town Simulation: Design Document (v0)

A pixel-art, top-down medieval town where every citizen has a job and a personality, every good can be traced to the person who made it, and the player is free to do almost anything: take a trade, buy land, become a merchant or landlord.

This file is the spec. Build to it, and update it whenever a rule changes.

## 1. Principles

1. **Freedom comes from systems, not content.** A few simple rules that interact, not hand-made scripts.
2. **Simulation first, graphics last.** The economy must work in a terminal before any art exists.
3. **Everything has a record.** Goods have makers, land has deeds, money moves between named people.
4. **Single-player first.** Multiplayer is a later option. Keep the simulation separate from graphics and input so it stays possible.
5. **Start small.** One town, about 60 people, five trades. Expand only when the loop is fun.

## 2. Tech

- TypeScript, Vite, PixiJS (browser).
- Folders: `sim/` (pure game logic, no graphics or keyboard code), `render/` (drawing), `data/` (goods, recipes, traits as JSON), `tests/`.
- Saves go to browser storage in the first versions.
- Commit to Git after every working step. Run tests after every change.

## 3. World and time

- One town on a grid map, divided into **plots** (see section 8).
- **Time:** one in-game day is about 4 real minutes (assumed default, adjustable in settings). The simulation must also run faster than real time for automated tests.
- Seasons, weather, and aging are out of scope for v0.

## 4. Citizens

Each citizen has: name, age, personality traits, family ties, household, job, home, coins, inventory, and needs (food, shelter, sleep).

Daily decision order: eat if hungry, then work, then trade, then rest. Decisions use simple priority rules (utility scoring), not scripts.

Roughly 40 workers plus dependents. Some people can be unemployed, which gives the world room to change.

### Families and households

- Citizens have real family ties: spouse, parents, children, and through them siblings, grandparents, aunts and uncles. Kin can live in different households.
- A **household** shares one larder and fire. Its **head** buys food and firewood for everyone in it.
- Household types are mixed: single adults, couples, couples with children, single parents, three generations under one roof, adult siblings, and married children living with their parents.
- Ages: children under 12 and elders (60 and over) do not work. From 12, young people work as apprentices and farmhands, as in a medieval town. Adults may work or stay at home (unemployed).
- Earning members support the household: when the head cannot afford the household's food and firewood, other members hand over coins (a recorded transfer, like any payment).
- When a head dies, the household passes to the spouse, then the eldest adult child, then the eldest other adult. The estate (coins and goods) passes with it. If only children are left, they move in with their nearest kin (grandparents, aunts or uncles, adult siblings), or are fostered by another household. (Provisional answer to the inheritance question in section 12.)

### Memories and conversation

- Citizens remember what happens to them: changing or starting work, going into service or taking a post, a tool breaking, losing kin, receiving or giving alms, help from kin, being taken in by relatives. Memories fade from talk after about two weeks.
- Each day people who meet talk: members of a household, kin visiting each other, workmates, buyers and sellers at the market, the helped and the priests at church. What they talk about is chosen by how much it weighs on them: present troubles (hunger, a cold hearth, short coins, a broken tool, prices that jumped), what is happening in town (events), recent memories, how the week went, and hopes (a better trade, a child about to start work, comfort at last).
- The listener answers according to their own situation (also hungry, comfortable enough to help, a smith hearing about a broken tool, a seller hearing about prices).
- The words live in `data/dialogue.json`; the choice of topic and reply comes from the simulation, never a script.
- Every conversation has a place (a house, the market, a workplace, the church), so a player nearby can overhear it.
- Talk only reads the world and uses its own dice, so it can never change the economy.

### Choosing and changing work

- There are no hand-made rescues. People change work only by the same rules, for the same reasons.
- Every few days (3 by default), a worker who lost money looks at what each trade earns and what it costs to start (tools, a day of inputs, a merchant's stock money), and moves to the best trade they can **afford**.
- People judge a trade by the few practitioners they know (kin first, then whoever they meet), not by a town-wide average. Because everyone sees a different sample, the town does not stampede into one trade at once.
- Laborer is the trade anyone can start with nothing, by hand if they have no tools, so a failing farmer, baker or merchant naturally steps down to it. People can also move up when they have saved enough.
- An unemployed adult takes up work when the household runs short of money for food or firewood, and now and then when a trade is clearly paying well. A worker in a comfortable household may stop working.
- Moving up to a better trade needs a large gap. Guards, priests and servants go back to a trade when one clearly pays better than their wage.

### Food and comfort

- Baked goods are preferred, but raw vegetables and fruit can be eaten too (lower appeal): the poor eat pottage, and farm households eat what they grow.
- Someone with no food for 7 days in a row starves (a setting in `data/town.json`).
- Families share: whoever has gone hungry longest eats first, then children, then elders, then working adults.
- How much taste matters depends on what a household can spare: the comfortable buy bread and tarts, the poor buy whatever fills them most cheaply.
- Well-off households (savings above about 10 days of living costs) spend a small share of the excess each day on comforts, used up the same day: for now, extra firewood. Luxury goods will join this basket in the wealth milestone.

## 5. Trades

Everyone is self-employed at first: buy inputs, make goods, sell them. Hiring and wages come later.

| Trade | Makes | Needs | Sells to |
|---|---|---|---|
| Farmer | wheat, vegetables, fruit | farmland, tools (wear out) | Baker, Merchant |
| Baker | bread, vegetable pie, fruit tart | wheat, vegetables, fruit, wood (oven fuel) | shop customers, Merchant |
| Laborer | wood, stone, iron ore; builds houses and other buildings | tools (axe, pickaxe), or bare hands at a fraction of the output; wood, stone, nails and fittings for building | Blacksmith, Baker, households (firewood), Merchant, building owners |
| Blacksmith | iron ingots, tools, nails and fittings | iron ore, wood (fuel) | Farmer, Laborer, construction |
| Merchant | nothing (only trades) | coins, carrying capacity | anyone |

### Dependencies

- Tools wear out. Farmers and laborers keep needing the blacksmith.
- The blacksmith needs iron ore and wood from the laborer.
- Bakers need farmers. Everyone needs bakers.
- Buildings need wood, stone, and the blacksmith's nails.
- The merchant moves goods between all of them.
- Every household burns firewood each day for cooking and warmth (part of the shelter need), so the laborer always has some customers.

## 6. Goods and traceability

- Every batch of goods records its **maker**, **inputs** (the batches used), and **time made**.
- Any item can be traced back: bread to its baker, then to the wheat batch used, then to the farmer who grew it.
- Track batches (for example 10 loaves) at first, not single items. Use individual items for special goods like tools.
- Tools and buildings have durability and wear down.

## 7. Markets, prices and money

- Each seller sets a price from costs plus a margin. Raise it when sold out, lower it when goods go unsold.
- **Merchant limits:** carries a limited amount, must walk between people, and only knows prices they have actually seen. This stops the merchant from controlling everything and makes trade emerge naturally.
- Bakers also sell directly through a retail shop, competing with the merchant.
- **Money:** a closed economy. A fixed number of coins is shared out at the start. Coins only move between accounts (people, the town treasury, the church, and the neighbouring towns) and must never be created or destroyed. The total across all of them never changes; the town's own share can rise or fall through trade.
- **Taxes:** the town authority takes a small market tax from every sale in town (paid by the seller, rounded down), and a small daily hearth tax from well-off households (the poor are exempt).

### Neighbouring towns and imports

- A few neighbouring towns are simulated much more simply than the main town: each has a purse of coins and a price list that drifts and reacts to events. Nobody lives in them in detail.
- Merchants can always import goods the town is short of, paying the neighbour's price plus the cost of the road. They do this speculatively (yesterday's shortages) and on **order**: when a buyer finds none in town, a merchant fetches it on the buyer's coins for the import cost plus a fee. In v0 goods arrive the same day.
- Merchants export surplus when a neighbour pays more, but not goods the town went short of yesterday. Imported batches record the town they came from.
- This makes the merchant valuable in bad times (a crop failure at home means good business importing grain) without letting them control everything: imports are dearer than local goods in normal times.

### How the market works

- Producers bring their stock to the market square and merchants keep stalls there, so every buyer sees every offer. Merchants are the ones who walk out to producers and to other towns.
- Having a good brought in from a neighbouring town is always one of a buyer's options, so local prices cannot stay above what an import costs. There is no other price cap.
- After the market closes, producers holding more than their working stock can consign the excess to a merchant for export, receiving the takings less the merchant's fee.
- If the town has no merchant, **travelling traders** from the neighbouring towns handle imports and exports, and the fee leaves town.
- A neighbouring town's prices follow its money (price level = (coins / starting coins) ^ 0.5). A town that buys too much from abroad finds imports getting dearer and exports paying more, so coins drift back (price-specie flow).
- Workers keep back a day of food when buying the tools and inputs they need to work: without them there is no income at all.

### Hand work

- Without an iron tool, people work by hand at a fraction of the output: farming with a wooden spade at 60%, gathering deadwood at 50%, mining at 15%. Iron tools last 40 days of use.

## 7a. Town authority, militia and church

- The **treasury** collects the market tax. Each week it decides how many paid posts it can afford: **guards** (the militia) and **priests** (the church). Posts go to unemployed adults, from struggling households first. If money runs short, posts are cut.
- The treasury keeps two weeks of wages and passes the rest to the **church** a little each day. The church gives **alms** (coins for food) to households where someone is going hungry or the purse is empty.
- The hearth tax is progressive: a small daily share of a household's savings above 10 days of food. The poor pay nothing.
- The **public granary**: in good times the authority buys cheap wheat and vegetables (up to a target store) from what producers could not sell, and in a shortage sells them at cost. The town starts with full stores.

## 7c. Family support, charity and service

- When a household cannot afford its food and firewood, its own members chip in first, then kin in other households who are comfortable.
- If someone has already gone hungry, the comfortable give **alms** directly, as a religious duty.
- **Domestic service** (the first form of hiring): households with savings well above comfort take on servants from poorer households, the idle first, and pay a daily wage worth a few meals. A household that can no longer pay lets the servant go.
- The **militia** protects the roads and the town: the more guards, the smaller the damage from bandits and other troubles.
- Unemployment is allowed and reported. It is kept in check by the same rules, not by force: struggling households send adults to work, laborer needs no money to start, and paid posts absorb some idle adults.

## 7b. Random events

- Events start by chance each day, last a while, and change the rules while they last. They are data (`data/events.json`), not scripts.
- Examples: crop failure (farm yields collapse, neighbours' crop prices rise a little, importing grain pays), bumper harvest, bandits on the roads (imports cost more; guards reduce the effect), a mine collapse (less ore and stone), a harsh cold spell (households burn more firewood), a house fire (a household loses its stores).

## 8. Land, buildings and rent

### Plots

- The map is a grid of plots. Each plot has: type (farmland, forest, quarry, town lot), location, owner (a person or business), and optionally a building.
- Land decides production: farmers need farmland, laborers need forest or quarry plots. Town lots near the market are worth more.
- Each plot keeps a **deed history** (every past owner, price and date).

### Buying and selling

- Anyone (NPC or player) can list a plot or building for sale, and anyone can make an offer.
- Price comes from location, fertility or resources, buildings on it, and demand.
- At the start, plots are distributed among NPCs. Some land can be kept by the town.

### Buildings

- Types: houses, farmhouses, shops, workshops (smithy, bakery), storehouses.
- Built by laborers from wood, stone and nails. Construction takes time.
- Buildings wear down and need repair, which creates steady demand for materials and labor.

### Renting

- Owners can rent buildings to other citizens or businesses, setting the rent. Rent is paid daily or weekly.
- Tenants choose based on what they can afford and where they need to be (a baker wants a shop near customers).
- Rules for unpaid rent and ending a lease will be defined in the first land milestone.

### Preventing hoarding

- If one person starts buying everything, add a small upkeep cost or tax per plot. Add this after the basics work, if needed.

## 9. The player

- Starts as an ordinary citizen with almost nothing (assumed default; open question below).
- Can take any trade, buy and sell goods, buy land, build, and rent property.
- The player uses the same rules as NPCs. No special prices or shortcuts.

## 10. Build order

1. **Goods economy**, no land yet. 60 NPCs, five trades, run from the terminal. *(Done.)*
2. **Stats page.** `stats.html` runs the simulation in the browser and charts the town over time: goods produced, median wealth, population, prices, jobs, money flows. *(Done.)*
3. **Citizen memories and dialogue.** *(Done, see section 4.)*
4. **Functional UI and bare-bones graphics (debug view).** *(Done: `index.html`.)* A tile map of coloured squares and labels (sprite names from `data/sprites.json`, placeholders until art exists): houses, fields, woods and quarry, bakery, smithy, merchants' row, market, church, granary. People walk home, to work and to market through the day; the simulation advances a day at midnight (4 real minutes at 1x, with 10x and 60x). An observer, standing in for the player until milestone 6, walks with WASD or the arrow keys and overhears conversations within about 7 tiles, shown as speech bubbles and in a log. Clicking a person or building shows its record, and anything a person holds can be traced back through its makers. Controls: pause, speeds, step one day, seed and new town; a People list; a Town news feed (events, deaths, work changes, family events, trade, alms) beside the overheard log. Until the land milestone the renderer lays the town out itself; real plots replace that layout later.
5. **Land and buildings.** Plots, deeds, construction, buying, selling and renting.
6. **Player as a citizen.**
7. **Wealth and luxuries.** Luxury goods and their makers (silk, pottery, fine cooking), wealth tiers in what households buy and where they live (shabby rented rooms to large townhouses). Needs the land milestone for housing.
8. **Polish and expansion.** Pixel art, more trades, laws, reputation, elections, fully simulated neighbouring towns.
9. **Multiplayer**, if ever.

## 11. Tests

1. The town survives 100 in-game days without starvation or bankruptcy.
2. Total coins never change (across people, treasury, church and neighbouring towns).
3. Any loaf of bread traces back to its baker and the farmer who grew the wheat.
4. Tools wear out and the blacksmith gets steady demand.
5. (Land milestone) Every plot has exactly one owner at all times, and its deed history is complete.
6. (Land milestone) Rent and sale payments move coins between people without creating or destroying any.

## 12. Open questions

- Player start: nobody with one trade and almost no money, or some money and a choice of land? (Suggested: nobody.)
- Final length of an in-game day.
- Tile size: 32x32 is assumed in section 14; confirm or switch to 16x16 before collecting any art.
- Who owns the land at the start, and does the town keep any?
- What happens to a citizen's property when they die (inheritance)? Provisional rule in section 4: it passes with the household; if nobody is left, the estate is frozen (its coins still count towards the fixed total).
- Should a household that runs out of firewood suffer more than a counter? (v0 records cold days only.)
- **Balance:** milestone 1 now holds: no starvation in 100 days on any of 600 seeds (`npx vite-node scripts/sweep.ts 1 600`). Over 200 days, 1 seed in 150 loses people. Some towns end the run with no farmers or bakers at all, living on imports and raw food; whether that should be possible is open.

## 13. Rules for building with AI

- Build one small feature at a time. Run it. Test it. Commit.
- Keep `sim/` free of any graphics or input code.
- Read this file before starting any task. If a change breaks a rule here, update this file first.

## 14. Art and rendering

### Target look

- Top-down, slightly angled pixel art with rich shading and a warm palette.
- Detailed multi-tile buildings (slate or thatched roofs, timber and stone walls), plus many small props: barrels, crates, benches, fences, flowers, market stalls, wells.
- Reference images are saved with the project in `art/reference/` for mood only. They are other people's work: do not copy them or use them as game assets.

### Technical rules

- **Tile size: 32x32 pixels** (assumed; see open questions). Every sprite and tileset must match it.
- Render at an integer zoom (2x, 3x, 4x) with nearest-neighbour scaling so pixels stay sharp. No smoothing.
- Maps are tile grids. Buildings are multi-tile sprites placed on plots from section 8.
- Layers, bottom to top: ground, paths and water, props, buildings, characters, roof and tree-top overlays, UI.
- Characters are small sprites with a few walk frames per direction. Start with one body type and recolored clothes.
- Maps can be authored in Tiled and loaded by PixiJS, or generated by code from plot data.

### Sprites are referenced by name

- The simulation never mentions image files. Data files map names to sprites, for example `"bakery": "building_bakery_01"`.
- `render/` looks the name up in a sprite atlas. Placeholder art (colored squares with labels) is used whenever a sprite is missing.
- Because of this, real art can be swapped in later without touching `sim/`.

### Staged plan

1. **Placeholders:** colored squares and text labels. The simulation is tested in the terminal and in a debug view.
2. **Small consistent set:** one tree, one house, one stall, one person, a path, grass. Prove the look and the pipeline.
3. **Full exterior set:** all five trades' buildings, props and character variants.
4. **Interiors:** a few key buildings only (tavern first). Most people simply enter a building and disappear from view.
5. **Polish:** animation, lighting, seasons.

### Art sources

- Asset packs, drawn by hand (Procreate or Aseprite), or commissioned. Check licenses allow commercial use and keep one consistent style.
- AI-generated images are for mood boards only, not game assets (inconsistent style, tiles don't line up).

### Interface

- Minimap, coins, date and time, and a small panel showing prices and money (also used for debugging).
- Click a person, building, plot or item to see its record: owner, maker, history.
