# Leonida Log design

**Visual source of truth:** the [design reference](https://claude.ai/artifact/FL8isDnFAyobGqPrkFeb9W). It has the chosen screens in light and dark, every component, the logo, palette and type. Component names below match it.

Built from the [idea page](https://github.com/dividedby/ideas/tree/main/projects/leonida-log) Decisions and Research. Visual rules are in [branding.md](branding.md). Decisions are recorded in [docs/adr/](adr/). The [design review](https://claude.ai/artifact/UeXqmdUW34qdRoMSfq4kg8) is decision history only: A Postcard in all sections.

## Goals

- Know what to do **before each point of no return**, and go into the next chapter as strong as possible.
- Track progress (checklist items, stats) from my phone while I play.
- Never spoil anything past the mission I'm on.

## v1 scope

- **Story position:** set the current mission. It drives every spoiler gate.
- **Before-you-move-on checklists:** one for each point of no return, starting with Tourist Trap in Chapter 1, grouped by category.
- **Stats:** Strength, Cardio and Focus (levels 0-4) for Jason and Lucia, with a manual workout log.
- **Romance / relationships** and **criminal profile** sections. Both are research-first, so they start thin and fill in as data is curated.
- **Data pipeline:** curated data in the repo, scrapers enriching a server database.
- **Out of v1:** the map (v2) and push notifications for stat decay.

## Screens

Components: PostcardHeader, ExitSign, StatStrip, StatRing, CategoryHeader, ChecklistRow, Chip, LockedRow, ProgressBar, PrimaryButton.

### Home

This is round 2, option A.

- **PostcardHeader:** chapter name, current mission, and "Mission N of 22".
- **ExitSign** for the next point of no return: "EXIT 20 · Tourist Trap · 3 of 6 done". The gate's mission is named before it is reached; what happens in it is not (ADR 0002).
- **StatStrip:** a compact strip with one slim row per character and three mini rings, tapping through to Stats. It's smaller than the round 2 mockup, per the feedback that the 3-stat card takes up too much space.
- **Up next:** 1-3 open ChecklistRows, with Chips such as "Soon lost".
- **Tab bar:** Story, Checklist, Stats, More. Map stays hidden until v2.

### Before you move on (checklist)

This is round 2, option A.

- **PostcardHeader:** the Tourist Trap name and "3 of 6 done".
- **CategoryHeader** for each category, with counts (Stats 2/2, Vehicles 0/1, Focus 0/1, Collectibles 1/1, Money 0/1), and ChecklistRows under each.
- **Chips:** "Soon lost" for items whose reward or access ends at their `lost_at_mission` (the gate or an earlier mission), no confidence chip: every entry shows its best-evidence value unlabelled (ADR 0008). Cutoffs show as a countdown from `closesIn` and `countdownLabel` ("Closes in N missions", "Do this before your next story mission" at 1), never by naming the closing mission. UI not built yet.
- **LockedRow:** "4 more unlock after Day Release", naming the mission that unlocks the earliest locked item for the gate. The count includes optional missions that haven't opened yet, and the mission named is always a main mission (an optional's anchor). The count and that mission title show; the content doesn't (ADR 0002).
- **Derived rows:** each opened optional mission bound to the gate shows as a checklist row with its countdown, most urgent first, and can be ticked. Optionals that stay open after the story (closes at `never`) show under "safe to leave" instead.
- **Lost list:** a gate's `lost` entries show before it as a countdown from `closesIn(data, current, gate.mission)`, for the next gate only (ExitSign's gate), and hide once closed.
- Each item opens a detail sheet with how-to, location text (when sourced) and source links.

### Stats

This is round 1, option A.

- One card per character, with StatRings for Strength, Cardio and Focus and "Last workout: 2 days ago".
- A "Log a workout" PrimaryButton, a tip that Strength and Cardio can slip while Focus levels stay, and how-to links per stat.

### More

- Romance / relationships, criminal profile, story position picker, and settings (theme, spoiler mode).

### Flows

1. **First run:** pick the current mission and land on Home. Chapters show as "Chapter N" until reached. Within the chosen chapter, missions are listed by number, and a title shows only for the one you select.
2. **Play session:** open Home, tick items, and log a workout.
3. **Hitting a point of no return:** finish the list and mark the mission done. The next gate's checklist unlocks.

## Data model (sketch)

- `chapters` (5) and `missions` live together in `missions.yaml`. The 91 main missions are KeenGamer's list (the count is disputed, see Open questions, and gtabase counts 109 entries, see the header of `missions.yaml`). Among the mains, list position is the canonical order; order is derived on load and never stored, so it can't disagree with the list. Order is the spoiler gate.
- Mission kinds: `main` (default), `optional`, `strangers-and-freaks`, `hourglass`, `side-job`. Every non-main mission also carries `character` (`jason`, `lucia` or `both`), `opens_after` (a main or optional mission slug), `closes_at` (a main mission slug or `never`), `sources[]` and an optional `note`; a main mission sets none of them. Any mission may carry an optional `evidence` (as on items: background only, never rendered, ADR 0008). The 7 optional missions entered so far sit after the mains in `missions.yaml`; they have no order of their own, so chapter counts (22/11/26/25/7) and gate orders (20/33/59/83) come from the mains only and never move. `never` is a reserved slug.
- `lib/curated.ts` derives `data.missions` (mains only; the current mission, the picker and `setCurrentMission` read it) and `data.optionalMissions` (`opensAnchor`, the main mission at the end of the `opens_after` chain; `opensOrder`, its order; `closesAt`; `closesOrder`, null for `never`), sorted by `opensOrder`. An optional opens when the player reaches its anchor and closes when they reach `closes_at`. Its gate is the first gate at or after `closes_at`; `never` has none.
- `gates.yaml`: missions that are points of no return, keyed by mission slug, with what you lose (e.g. Tourist Trap → Ultimate Edition vehicles, free roam as both). Tourist Trap, Checking Out, The Cartel Heist (the Bayside Safehouse, per Beebom and gta.wiki) and Sunset (free roam only) are listed.
- `items/<gate-slug>.yaml`, one file per gate: id, title, category, `before_gate` (the gate's mission slug), `visible_after_mission` (the single visibility field), optional `lost_at_mission`, `verified`, optional `evidence` (`basis`, optional `note`; background only, never rendered, ADR 0008), `how_to`, optional `location`, `sources[]` (url, title, accessed date). Items exist for the four gates (Tourist Trap, Checking Out, The Cartel Heist and Sunset); Unfinished Business has no gate or items (see Open questions).
- Item text (title, how_to, location) names no mission after its `visible_after_mission`, except its own gate's title; earlier cutoffs live only in `lost_at_mission` (ADR 0002, amended 2026-11-26). The app shows "Closes in N missions" / "Do this before your next story mission" from it and from `closes_at` (ADR 0002, second amendment, 2026-11-26); UI not built yet. Optional-mission titles and notes follow the same rule from their `opens_after` anchor, and no gate `lost` entry names a mission. A mission slug and an item id may not collide (`item_checks` stores both under one key); the repository lets an optional mission's slug be ticked like an item.
- `lib/curated.ts` validates all files and the rules across them (known refs, `visible_after` and `lost_at` no later than the gate, `lost_at` not before `visible_after`; for optional missions, a resolvable `opens_after` chain with no cycle, `closes_at` a main mission or `never`, `opens_after` no later than `closes_at`, `closes_at` no later than the last gate) and fails on any issue. `lib/curated-load.ts` reads the files, server only.
- `lib/gates.ts`: `isVisible`, `nextGate` (a gate you're on isn't passed yet), `lockedSummary` (count plus unlock mission, optionals included), `closesIn` (a countdown: `open` N missions, `closed`, or `never`; standing on the closing mission counts as closed), `countdownLabel` (the UI text, null when closed or never), `gateOptionals` (opened, unclosed optionals for a gate, most urgent first), `safeToLeave` (opened optionals that never close), `missionsInChapter` (ids and numbers), `missionTitle`, `pickerChapters`. It never returns titles, except through `missionTitle`. The current mission is always a main mission; an optional slug throws.
- SQLite via Drizzle (`lib/db/schema.ts`, SQL in `drizzle/`, applied by `pnpm db:migrate`; see ADR 0004). Timestamps are ms-epoch integers. Curated ids (mission and item slugs) are plain text with no foreign key; `lib/db/repository.ts` validates them against curated data before writing.
- `progress`: single row (id = 1), created on the first write. `current_mission` is null until onboarding; `spoiler_mode` is `safe` or `open` (default `safe`); `theme` is `system`, `light` or `dark` (default `system`).
- `item_checks`: checked item ids with `checked_at`.
- `stat_levels`: level 0-4 per character × stat (Strength, Cardio, Focus).
- `workouts`: character, stat, at. Any of the three stats can be logged; only Strength and Cardio slip (ADR 0006).
- `sources` (scraper module id, url, title, host, HTTP validators, remote and content hashes, check and change times, the latest normalized `extract`) and `candidates` (source, gate, category and mission hints, `change_kind` `new`/`modified`, `diff_summary`, `raw_extract`, status `new`/`promoted`/`rejected`): scraper-owned, server only, `extract` and `raw_extract` are never rendered. The repository doesn't expose them yet. How the scrapers fill them: [scrapers/README.md](../scrapers/README.md).
- Romance and criminal profile get their own tables once research shows what's trackable.

## Data sources and refresh

- **Curated (in repo):** `data/curated/*.yaml` covers missions, gates and items at their current best-evidence value (ADR 0008). It's the source of truth and is reviewed by hand.
- **Scraped (server only):** scrapers fetch guide pages and store raw extracts with URL and fetch time in the server database. Nothing scraped is committed.
- **Merge:** scraped facts become _candidates_, and are promoted to curated after review. The app shows only curated items, never a candidate or a confidence label (ADR 0008).
- **Refresh:** manual runs, plus a light weekly systemd timer with Discord alerts while launch-period guides are still changing.
- **Spoiler safety:** every item needs a `visible_after_mission`. Scraped text is never shown raw, because guide pages mix later spoilers in.

## Architecture

- **App:** Next.js (App Router) + TypeScript, server components, with server actions for writes. Installable PWA, phone-first.
- **Database:** on the server (SQLite with Drizzle, one file on a volume, since it's a single user on a small box; see ADR 0004).
- **Hosting:** docker compose on the Hetzner VPS behind a Cloudflare Tunnel with Cloudflare Access (Google SSO) at gta.dvdby.cc. CD runs from GitHub Actions.
- **Scrapers:** a separate small Node CLI in the same repo, run by a timer, with polite rate limits and robots.txt respected (ADR 0007).

## Risks

- **Scraping terms:** some guide sites forbid it (IGN, KeenGamer, Polygon, GameSpot). Keep the data private, attribute sources, and drop a source module if its site objects. [docs/sources.md](sources.md) ranks the sources, records each site's robots.txt and fetch method, and says which ones get a scraper.
- **Launch-week accuracy:** guides disagree and update daily. Hence best evidence with a tie-break toward the safe value, weekly re-research, and source links (ADR 0008).
- **Spoiler leaks** through scraped text or item titles. Mitigated by gating every item and never rendering raw scrapes.
- **Rockstar IP:** don't use official art or logos. Any public launch would need another look at names and assets.
- **Small VPS:** scrapers must stay light, with no headless-browser farms on the box.
- **Stat decay tracking:** the exact rules are unknown, so v1 uses a manual workout log with no notifications.

## Settled at build start (2026-11-25)

- Checklist keeps A's done/total count per CategoryHeader; no per-category progress bar.
- Stat decay: manual workout log only, no reminders (ADR 0006).
- Romance and criminal profile ship research-first under More.
- Scrapers may fetch any source, within robots.txt and polite rate limits (ADR 0007).

## Open questions

Mostly from the 2026-11-25 pre-gate research (all sources are launch-week guides, several single-source or AI-assisted). "Unverified" below means `verified: false` in the data: research background, never shown in the app (ADR 0008).

- **Sunset (gate, mission 83):** added as a gate with free roam only on its lost list (PowerPyx says most missions after it run before open world; gtabase's wording is "moves the story into Chapter 5; finish side activities first", not "point of no return", so the free-roam lock rests on PowerPyx alone and is provisional). Still open: the exact end of the closed stretch (GTA6BUGS and Leonida Hub say Honest Abe, PowerPyx only says "most"), manual saves (one reporter), BuckMe checking frozen at $0 until Operation Savage Glory (gameta, Leonida Hub, gta6helphub), weapons, equipment and outfits taken and returned (PowerPyx; where they are taken is unconfirmed), Suite 701 as a base (RetroBroker says it stops, gta6helphub says it stays your home until Ch4 ends), gtasixvicecity mapping the point of no return to the mission after Sunset, and the Chapter 4/5 boundary (PowerPyx says Sunset starts Chapter 5, KeenGamer puts one more mission in Chapter 4). Item text names none of this.
- **Unfinished Business (Ch5):** no gate or items, and it isn't in KeenGamer's 91-mission list (gtabase, PowerPyx and egamers list it). gtabase says there is no going back, and signing Abe's deal loses checking and pocket cash while Family Savings is protected and returned later (Output Lag and PowerPyx, both read). It is not a recap mission (GTA Explained, Polygon and our Chapter 5 count of 7 agree; Honest Abe and Pay Abe's Fee likewise). Still pending the owner; the mission-kinds change (2026-11-26) didn't decide it.
- **Shitzu Squalo:** Tech4Gamers says it can only be claimed during Chapter 4, at the canal south of Washington Beach by the Y Hotel; KeenGamer agrees on Chapter 4 and egamers also says "only" (gtabase is silent). Likely Ch4-only, not confirmed. No item: how long it stays claimable is unknown.
- **Lock-in start for Tourist Trap:** PowerPyx's Recalibration page says there is no free roam once you start Recalibration and calls it the last chance in Chapter 1 (two cross-checks read it). Its Tourist Trap page says the lock starts when you go to Lucia, and VGC and gtabase also name Tourist Trap. Items use the earlier, safe line: `finish-before-recalibration` is lost_at `recalibration` and names no mission (unverified). No first-hand report confirms either.
- **Checking balance:** Rock Paper Shotgun and allthings.how both say it's lost at Tourist Trap, and Playtheory's own save plus a Project VI video test agree, so `empty-checking` is verified. Attachment carry-over is disputed (Playtheory kept mods; three unopenable Reddit reports say lost), so `spend-on-weapons` stays verified on the well-sourced weapons claim and hedges attachments in its text. Outfits are disputed (Playtheory says lost; IGN's Tourist Trap walkthrough and KeenGamer say cosmetics carry over, gameta says wardrobe-saved accessories return), so `bought-outfits` is unverified. Ammo has no source.
- **Checking Out carry-over:** Leonida Streets says cash, bank balance and registered vehicles are kept; one unverified Reddit comment says registered cars are impounded. Registered cars aren't listed as lost.
- **Tourist Trap trigger:** the same moment under two names. "Take Up Mattia's Offer" is the map marker, and approaching Lucia starts the mission. The marker name is from The Games Wiki only, so that item is unverified.
- **Carry-over:** bought weapons carry past Tourist Trap (Playtheory's own save, Output Lag, several GameFAQs player reports). Ammo is unconfirmed, attachments are disputed (see Checking balance), clothing and tattoos carry per gta6story.org, allthings.how and KeenGamer but Playtheory's save lost the clothes, and registered vehicles are disputed (see Checking Out carry-over); bought garages are only "no loss reported".
- **Relationship:** launch guides say no permanent breakup (lowest level is Running on Empty); VGC and games.gg say neglect locks one ending, mechanism unknown. The level-2 name is Partners In Crime (VGC, PlayDay) or Not So Hot (gtabase, Insider Gaming, KeenGamer).
- **Checking Out's $15,000:** `save-fifteen-thousand` is verified (PowerPyx, gtabase, gta6bugs; it is the in-game Prepare for Vice City objective). IGN dissents: it only speeds the unlock. Bank it; pocket cash may not count. Nobody says it is spent. The Starlet Motel's location is also disputed (Port Gellhorn vs Kelly County).
- **Counts that differ:** Strangers & Freaks totals, and the Kyle strawberry boost (Game8 and games.gg say the first berry is permanent; how long later ones last is unknown). WAiNK is settled at 108 (PowerPyx, IGN, HeistAtlas).
- **Placement that differs:** the Shayna pickup (Ch3 or Ch4) and Bret's hunting line (Ch2 or after it).
- **'67 Dominator Buggy (Ultimate Edition):** IGN calls the pickup garage the Paradise RV Park; Tech4Gamers says Grassrivers, Mariana County (a purple task about a day after Billy's Thrillbillies), then keep it at the Paradise Garage in Watson Bay. Both names are now in the item, and IGN confirms the Thrillbillies trigger. Shipped as `dominator-buggy`.
- **Motel magazine name:** settled. The cover reads Children of Wizard Wang on screen (Cavaliers Gaming, cross-check); "Wizard Wang" is likely the collectible-list label.
- **Race Against Yago expiry:** gtabase and The Click say only the timer ends it; other guides say it closes with the chapter. The item keeps the heist as its safe bound and is unverified.
- **Meditate with Lucia close:** only a video says it closes at Recalibration; gtabase and The Click say Chapter 1. `balcony-meditation` is unchanged.
- **Moses pay:** widened. Scan cards show $1,150 (Phoenix) and $7,645 (Dominator), typical early cars about $400 (HarmNone), GTABoom $1,000-$3,000; higher reports are unverified and the cooldown is disputed.
- **Ambulance Chaser:** missions.yaml has it as a main mission (Ch2 #2); gtabase and The Click list a Slam Dunk cutoff for an entry of that name, and whether it is the same mission or a separate job is unclear. Owner decision 2026-11-26: it stays a main mission. Making it optional would shift every later gate by one, and a main mission carries no `closes_at`.
- **Mission count:** the app keeps KeenGamer's 91 (also The Tab, Gamer Tweak). 92 is Gfinity, and Game Rant says 91 in its lede and 92 in its intro. 93 is Polygon ("as listed in the Story Recap") and TalkEsport, which add Thrillbillies, Twist Wrist, Smash, Grab and Kitty Litter Labs and drop Caught Slipping; 95 is VGC, which adds the same three and keeps Caught Slipping. Game Rant and gtabase tag Billy's two jobs Optional, gtabase and gta6bugs tag Kitty Litter Labs Optional, and The Tab says it leaves out Optional-tagged entries; those lists keep Caught Slipping main. Polygon also spells "Zorruso" and "Starting from Zero". Round 4 found no completed in-game Story Recap; gtabase, gta.guide and gta.wiki keep Caught Slipping as a main mission, and 93 and 95 include optional entries. If 93 wins, Checking Out becomes #35 and The Cartel Heist #61.
- **Bayside timing:** gtabase says the apartment is reachable after the heist and is lost when the next chapter starts; Beebom, Wanted State, gta6playertools and gta6heists put the loss at or right after the heist. Items keep the heist bound.
- **Strength and Cardio at the chapter change:** one GameSight save shows Strength dropping while Cardio and Focus stay; The Games Wiki says all of Jason's fitness levels drop. `strength` and `cardio` are unverified.
- **Donnie's Drop-Off close:** Game8 puts it later than Game Checklists and The Games Wiki. `donnies-drop-off` is lost at the earlier line and unverified.
- **Coming Home cutoffs:** `house-repairs` (item) and the optional missions `buy-lucia-a-necklace` and `get-lucias-clothes` close at Coming Home.
- **Optional missions not yet entered (mission-kinds, 2026-11-26):** only 7 have READY evidence (kind, character, `opens_after` and `closes_at` all supported; `never` stated affirmatively): `get-shirleys-rum`, `steal-the-scooter`, `ring-the-bell`, `get-lucias-clothes`, `buy-lucia-a-necklace`, `bad-driver`, `veteran-hunted` (the only `never`). Their items (`shirley-side-missions`, `ring-the-bell`, `get-lucias-clothes`, `lucias-necklace`, `bad-driver`, `bret-hunting`) were removed. The rest keep their items, where one exists, until a window is confirmed (owner decision: no `unknown` `closes_at` value). Closing mission not supported: Clock Out, Pick Up Groceries, Buy Flowers, Get The Chop, Find the Lost Drugs, Donnie's Lost Drugs, Impounded Vehicle, This Is a Free Call From..., Pick Up a Gun, Hit Avery Pawn, Collect Felipe's Gift, Brother to Brother, Get Your Wheels, Attend Eddie Acosta's Party, It's A Date!, Dre'Quan's Gift. Disputed: Meditate with Lucia, Race Against Yago, Donnie's Drop-Off. Staying open after the story unproven: Thrillbillies (Game Checklists also says the Mud Club jobs may not return), Twist Wrist, Smash, Grab, Hit Kingpin Bowling, Kitty Litter Labs (kind also disputed), Spin On This, Catch a Bigger Fish, Search the Dive Sites, Search for the Skunk Ape, Search for Tree Effigies, Help Kirk Find Mr. Mangrove, The Final Flush, Retest Freddie's Defenses, Collect Moses' Gift, Gellhorn's Missing Tourists, Missing Persons, UFO Abduction, Join a Street Race, Bumper to Bumper, Buddy?, Mall Rats, The Impaler, Hometown Heroes, Sisters of the Sea, Yasmani's Jewelry, ATM and Payday Loans jobs, That's Where the Money Is..., The Last Mile: Passing the Torch, Climbing the Cellerichain, The Unknown Stuntman. Trigger is not a mission: Check Out McKittrick Farm, Collect Chemicals for Kyle. Title or mapping unresolved: Bret's Hunting Decks, Steal Vehicles for Moses, Tail the Security Van, Randy's Wish List, Dunk's Robbery Tips. IGN-only sidebar entries and single-source candidates stay out. **Thrillbillies, Twist Wrist, Smash, Grab and Kitty Litter Labs** (the 91 vs 93 question) are still dispute-recorded and not entered as missions of any kind.
- **Left out for spoiler safety:** the Moreland 850 pickup inside Tourist Trap, the burned-house revisit and what to do for Lucia in Checking Out's escape. All are mission content or spoil Tourist Trap, so none fits a gated item. Round 4 adds Checking Out loadout prep, the Cartel Heist vault numbers and the Sunset loadout, which describe gate-mission content.
- How the romance/relationship and criminal profile systems work, and what's trackable. Research.
- How stat decay works.

## Follow-ups (out of scope)

Round 4 evidence tagged READY that is reference data, not a before-gate action, so no item carries it yet: the death and arrest fee ($25 allthings.how, $74 PinnedinLeonida first-hand), body armor prices ($250 and $225), criminal profile tiers (Professional, Hardened, Violent, Psycho, Irredeemable), the Focus tip, fences, trunk outfits, the WAiNK scan, the $20,000 carry cap, the Rockstar 23 Nov patch note and the Key Cloner. Optional-mission data beyond the 7 READY entries waits on confirmed windows (see Open questions).
