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
- The land and town are generated from the seed (`sim/land.ts`), as a walled lakeside town: a lake on one edge, a canal from it through the middle of town with plank bridges and boardwalk streets, docks on the shore, and a stone wall with gates where the roads to the neighbouring towns come in. Inside the wall: the market by the canal, church, granary, merchants' row, bakery, and the smithy against the wall. Outside: fields on open ground, woods and quarry in the forest. Houses of mixed sizes are packed irregularly along streets and against each other; the well-off take townhouses near the market and canal, and the poorest may build cottages outside the wall near their work. The look is autumnal (golden grass, red and orange woods). Generation uses its own random stream, so the map never changes the economy, and the same seed always gives the same town.
- **Time:** one in-game day is about 4 real minutes (assumed default, adjustable in settings). The simulation must also run faster than real time for automated tests.
- Seasons and weather are out of scope for now. People age: a year passes every 30 days (`growth.yearDays` in `data/town.json`).

## 4. Citizens

Each citizen has: name, age, personality traits, family ties, household, job, home, coins, inventory, and needs (food, shelter, sleep).

Daily decision order: eat if hungry, then work, then trade, then rest. Decisions use simple priority rules (utility scoring), not scripts.

Roughly 40 workers plus dependents. Some people can be unemployed, which gives the world room to change.

### A growing town

- The town starts with about 100 people and grows by its own rules (`sim/growth.ts`): everyone ages a year each in-game year; married couples have children (less often when the household is struggling); the old die, more likely the older they are; and single young adults marry someone from another household who is not close kin.
- A newly married couple moves into the home of whichever of them lives alone. Otherwise they live with family while builders put up a new house on a free plot by a street (inside the wall if there is room), a share of the work each day, paid for by the couple. When it is finished they become a household of their own.

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

### Daily life

- Each person's day is a sequence of visible tasks built from what really happened that day (`sim/routine.ts`, words and places in `data/routines.json`). A farmer who grew wheat ploughs, sows, weeds, scythes, binds sheaves and carts the harvest home; a baker grinds, kneads, fires the oven, bakes and sets out the bread; a smith stokes, heats, hammers, quenches and hafts. A worker with nothing to make does small jobs instead. The goods are still made by the recipe; the tasks show how.
- Merchants open their stall, walk out to producers, unload imports at the docks or gate, load exports, and cry their wares in the market. Guards walk the wall and watch the gates, priests pray and visit the poor, servants fetch water and cook, elders sit by the door or watch the boats.
- Children under 12 play outside (tag, hide and seek, hoops, skipping stones on the canal, racing to the docks), with the odd chore for the older ones.
- In the town view people walk the streets at a walking pace (children run, elders are slower), use the bridges and gates, and work through their tasks at different spots. The task of anyone near the observer is shown over their head.

### School, infirmary and tavern

- The treasury staffs posts by need, most needed first: **healers** (about one per 40 people) at the infirmary, **priests** (one per 30), **teachers** (one per 15 children aged 6 to 11) at the school, then **guards** (one per 20), as far as tax income allows.
- Children aged 6 to 11 have lessons at the school in the morning when there is a teacher, then play.
- People fall ill now and then (about a third of a sickness a year; a fever outbreak makes it four times as likely) and cannot work while sick. With a healer they recover sooner and are less likely to die; the very young and the old are most at risk (`sim/health.ts`).
- The **innkeeper** brews ale from wheat and firewood at the tavern. In the evening, adults whose household can spare it go for a couple of ales and some company.

### Merchants' specialities and adverts

- Each merchant deals in one group of goods (grain and produce, baked goods, timber and stone, or iron and tools), chosen to fill the gap in town when they take up the trade. They buy, import and export only within it; an import order goes to the merchant who deals in that good if there is one.
- Each day every merchant with stock posts a public advert of their best-stocked goods, with prices and where imports came from. It is cried in the market during market hours and posted on the notice board.

### Choosing and changing work

- There are no hand-made rescues. People change work only by the same rules, for the same reasons.
- Every few days (3 by default), a worker who lost money looks at what each trade earns and what it costs to start (tools, a day of inputs, a merchant's stock money), and moves to the best trade they can **afford**.
- People judge a trade by the few practitioners they know (kin first, then whoever they meet), not by a town-wide average. Because everyone sees a different sample, the town does not stampede into one trade at once.
- Lumberjacking and foraging can be started with nothing (wood by hand, berries need no tools), so a failing farmer, baker or merchant naturally steps down to them. People judge a trade over a full week, and nobody changes in their first week. People can also move up when they have saved enough.
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
| Lumberjack | wood | an axe (or bare hands, half as much) | Blacksmith, Baker, households (firewood), builders, Merchant |
| Miner | iron ore, stone | a pickaxe (by hand, very little) | Blacksmith, builders, Merchant |
| Forager | berries, mushrooms, herbs from the wildwood | nothing | households, Merchant |
| Fisherman | fish, rowing out from the docks before dawn | a boat | households, Merchant |
| Builder | repairs and new buildings | wood, stone, nails and fittings, bought per job | building owners and the treasury |
| Blacksmith | iron ingots, tools, nails and fittings | iron ore, wood (fuel) | Farmer, Lumberjack, Miner, builders |
| Merchant | nothing (only trades) | coins, carrying capacity | anyone |

### Dependencies

- Tools wear out. Farmers, lumberjacks and miners keep needing the blacksmith.
- The blacksmith needs iron ore from the miner and wood from the lumberjack.
- Bakers need farmers. Everyone needs bakers.
- Buildings need wood, stone, and the blacksmith's nails.
- The merchant moves goods between all of them.
- Every household burns firewood each day for cooking and warmth (part of the shelter need), so the lumberjack always has some customers.
- Buildings wear down every day. Owners (households for their homes, the treasury for the town's buildings) pay builders to repair them; a builder buys the wood, stone and nails for each job and charges materials plus a day's labour. Poor households let their homes run down. Country work sites do not decay (`sim/construction.ts`).

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

- The **treasury** collects the market tax. Each week it staffs paid posts for what the town needs, about one **guard** (the militia) per 20 people and one **priest** (the church) per 30, as far as it can afford them. Tax income limits posts but never creates them. Posts go to unemployed adults, from struggling households first. If money runs short, posts are cut.
- The treasury keeps two weeks of wages and passes the rest to the **church** a little each day. The church gives **alms** (coins for food) to households where someone is going hungry or the purse is empty.
- The hearth tax is progressive: a small daily share of a household's savings above 10 days of food. The poor pay nothing.
- The **public granary**: in good times the authority buys cheap wheat and vegetables (up to a target store) from what producers could not sell, and in a shortage sells them at cost. The town starts with full stores.

## 7c. Family support, charity and service

- When a household cannot afford its food and firewood, its own members chip in first, then kin in other households who are comfortable.
- If someone has already gone hungry, the comfortable give **alms** directly, as a religious duty.
- **Domestic service** (the first form of hiring): households with savings well above comfort take on a servant (a second only for a household of six or more) from idle adults in poorer households, and pay a daily wage worth a few meals. Service never pulls people out of a productive trade. A household that can no longer pay lets the servant go.
- The **militia** protects the roads and the town: the more guards, the smaller the damage from bandits and other troubles.
- Unemployment is allowed and reported. It is kept in check by the same rules, not by force: struggling households send adults to work, lumberjacking and foraging need no money to start, and paid posts absorb some idle adults.

## 7c. Politics: the mayor and the town's policy

Built in `sim/politics.ts`; doctrines and their policies in `data/politics.json`.

- Every term (60 days, about two years) the town elects a **mayor**. Two or three notables stand: the most established adults (wealth, property, office, age 28 and over), each with a **doctrine** that follows from their place in town. Property owners and merchants lean Free Marketeer or Traditionalist, guards and priests Traditionalist, teachers and healers Liberal, gatherers (farmers, fishermen and the like) Isolationist, and the rest by how well off they are.
- Every adult votes by their own interests and by how the town fared under the sitting mayor: struggling families and parents of schoolchildren favour the Liberal, property owners and merchants the Free Marketeer, guards, priests and elders the Traditionalist (more so after fires or bandits), gatherers the Isolationist when imports undercut them. A mayor whose term saw the town's fortune fall, or anyone starve, loses votes. The mayor is paid a small stipend.
- The doctrine sets the **policy** for the whole term, and it is felt everywhere:

| Doctrine | Taxes | Public posts | Trade | Welfare, rent, building |
|---|---|---|---|---|
| **Liberal Reformer** | modest market tax, heavy tax on savings | many healers and teachers, fewer guards | small tariff | large church grants (alms); rents capped; a bigger granary |
| **Traditionalist** | higher market tax, light on savings | many guards and priests, few teachers | small tariff | modest welfare; landlords free; dearer plots |
| **Isolationist** | middling | more guards | heavy import tariffs; no food leaves town; dearer roads | full granary |
| **Free Marketeer** | very low taxes | very few posts | no tariffs; cheaper roads | little welfare; cheap plots for developers |

- Tariffs are paid to the treasury on every import; like every payment they move coins between accounts and never create or destroy them.

## 7d. Progression: the town's fortune

Built in `sim/progress.ts`.

- Towns start humble: most families live in cottages, a few in houses, and only the very richest in townhouses.
- Each day the town has a **fortune** score (0 to 100) from how much its families have saved, how it has grown, the state of its homes, how many are in better homes, how many businesses it has, and hardship (hunger and starvation). The score gives the town its standing: **Destitute**, **Struggling hamlet**, **Humble village**, **Modest market town**, **Thriving town** or **Prosperous town**. The news reports when the standing changes, and the Town Ledger charts it, coloured by the mayor in office.
- Homes improve with prosperity: a family that owns its home and has savings to spare has builders enlarge it (cottage, then house, then townhouse), and a landlord improves a house they let when the tenants are doing well (and then charges more rent). Homes left unrepaired run down and show it on the map (dimmer, cracked).

## 7b. Random events

- Events start by chance each day, last a while, and change the rules while they last. They are data (`data/events.json`), not scripts.
- Examples: crop failure (farm yields collapse, neighbours' crop prices rise a little, importing grain pays), bumper harvest, bandits on the roads (imports cost more; guards reduce the effect), a mine collapse (less ore and stone), a harsh cold spell (households burn more firewood), a house fire (a household loses its stores).

## 8. Land, buildings and rent

Built in `sim/property.ts` (with `sim/construction.ts` and `sim/land.ts`). Settings are under `property` in `data/town.json`.

### Plots and owners

- Every building and site on the map is a property with exactly one owner and a **deed history**: the founding grant, then every sale with seller, buyer, price and day.
- The town keeps only its common buildings: the market square, church, granary, school and infirmary. Every home, business and work site (fields, woods, quarry, wildwood, fishing jetty, bakery, smithy, tavern, builders' yard, merchants' row) belongs to a citizen.
- Land decides production: farmers work fields, lumberjacks the woods, miners the quarry, foragers the wildwood, fishermen from the jetty. Town lots near the market and canal are where the well-off live.

### Burghers: who owns what

- Owning property on a large scale is for the few. At the founding, the richest households (about 8% of households, which is 2 to 3% of people) are **burghers**: they own the businesses and most houses. The next richest (about 15% of households) own the house they live in. Everyone else rents.
- Over time the share of people owning more than their own home stays within 1 to 5%: buying property needs savings far beyond most households' means.

### Rent, site fees and wages

- Tenants pay their landlord rent every day, set by the size of the house and the price of food. A household that cannot pay runs up arrears; after a while the landlord lowers the rent. Landlords raise rents while couples are waiting for houses, and lower them on houses that stand empty.
- Tradespeople pay the owner of the site they work at a share (10%) of the day's sales.
- Owners of farms, woods, quarries, wildwood and fisheries hire employees for a daily wage when a day's output is clearly worth more than the wage. What an employee makes belongs to the employer, who sells it (the batch still records who made it). An employer who cannot pay lets them go.

### Buying and selling

- A property is valued at about 60 days of what it earns (rent for a house; site fees and output for a business).
- Owners in trouble (short of money, or dead with no one to inherit) put property up for sale; the asking price falls each day it goes unsold. Wealthy households with plenty to spare bid; with rival bidders the price is bid up to just above the second best offer.
- Each week, households with savings well beyond their needs also make unasked-for offers on property that would pay them back. The more such investors there are, the more they offer. An owner sells when an offer clearly beats what the property is worth to them (by 15%); nobody sells the home they live in this way. Each investor buys at most one property a week.

### Development: building as an investment

- A burgher with money to spare beyond 60 days of living costs invests: a **house to let** when couples are waiting for homes and none stands empty, otherwise a **new business** (bakery, tavern, smithy or farm) in the trade doing best. They buy the plot from the town and pay builders day by day, materials plus labour, until it is finished.
- A new business is **named and specialised** by its owner (from `data/businesses.json`): "Vane & Sons Bakehouse, known for pies", "The Golden Hart, an ale house". The speciality makes its recipe more attractive to those who work there. A tradesperson of that trade moves to work at the new site.

### Buildings

- Buildings wear down every day; owners pay builders to repair them (the treasury for the town's buildings). Poor households let their homes run down. Building and repair use wood, stone and nails.

### Homes for new couples

- Newly married couples rent: they move into an empty house to let, or live apart with family until one is free. Burghers build houses to let when couples are waiting.

### Still open

- Eviction for long arrears, leases, and the player owning property (the player milestone).
- A tax or upkeep per property if one burgher starts buying everything.

## 9. The player

- Starts as an ordinary citizen with almost nothing (assumed default; open question below).
- Can take any trade, buy and sell goods, buy land, build, and rent property.
- The player uses the same rules as NPCs. No special prices or shortcuts.

Until then the player watches one town, saved in the browser (`sim/save.ts`; old records are trimmed daily so a
town played for years stays small), and holds a god's powers over its people (`sim/god.ts`): rename people and
families, set a person's coins, marry or part a couple, move someone to another household, choose a household's
head. Coins still only move by `transfer()`: gifts come from the **heavens**, an account holding 50,000 coins at
the founding and counted in the world's total, and coins taken go back to it.

Elections are watched live: the campaign's candidates speak at the market each afternoon; on election day each
voter walks to the market to cast the ballot the simulation already recorded (`DayReport.election.ballots`), the
count fills as they arrive, and the winner is announced at about 17:15.

## 10. Build order

1. **Goods economy**, no land yet. 60 NPCs, five trades, run from the terminal. *(Done.)*
2. **Stats page.** `stats.html` runs the simulation in the browser and charts the town over time: goods produced, median wealth, population, prices, jobs, money flows. *(Done.)*
3. **Citizen memories and dialogue.** *(Done, see section 4.)*
4. **Functional UI and bare-bones graphics (debug view).** *(Done: `index.html`.)* A tile map of coloured squares and labels (sprite names from `data/sprites.json`, placeholders until art exists): houses, fields, woods and quarry, bakery, smithy, merchants' row, market, church, granary. People walk home, to work and to market through the day; the simulation advances a day at midnight (4 real minutes at 1x, with 10x and 60x). An observer, standing in for the player until milestone 6, walks with WASD or the arrow keys and overhears conversations within about 7 tiles, shown as speech bubbles and in a log. Clicking a person or building shows its record, and anything a person holds can be traced back through its makers. Controls: pause, speeds, step one day, seed and new town; a People list; a Town news feed (events, deaths, work changes, family events, trade, alms) beside the overheard log. The town's layout is generated by the simulation from the seed (section 3).
5. **Land and buildings.** Plots, deeds, construction, buying, selling and renting, burghers, hiring and named businesses. *(Done: section 8.)*
6. **Player as a citizen.**
7. **Progression and politics.** A town that starts humble and visibly grows into prosperity, or declines into hardship, as the years pass; elected mayors whose doctrine sets the town's policy. *(Done: sections 7c and 7d.)*
8. **Wealth and luxuries.** Luxury goods and their makers (silk, pottery, fine cooking), wealth tiers in what households buy and where they live (shabby rented rooms to large townhouses). Needs the land milestone for housing.
9. **Polish and expansion.** Pixel art, more trades, laws, reputation, elections, fully simulated neighbouring towns.
10. **Multiplayer**, if ever.

## 11. Tests

1. The town survives 100 in-game days without starvation or bankruptcy.
2. Total coins never change (across people, treasury, church and neighbouring towns).
3. Any loaf of bread traces back to its baker and the farmer who grew the wheat.
4. Tools wear out and the blacksmith gets steady demand.
5. (Land milestone, tested) Every plot has exactly one owner at all times, and its deed history is complete.
6. (Land milestone, tested) Rent and sale payments move coins between people without creating or destroying any.

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
