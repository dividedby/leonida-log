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

- `chapters` (5) and `missions` live together in `missions.yaml`. The 92 main missions are KeenGamer's 91 plus Pool Day (the count is disputed, see Open questions, and gtabase counts 109 entries, see the header of `missions.yaml`). Among the mains, list position is the canonical order; order is derived on load and never stored, so it can't disagree with the list. Order is the spoiler gate.
- Mission kinds: `main` (default), `optional`, `strangers-and-freaks`, `hourglass`, `side-job`. Every non-main mission also carries `character` (`jason`, `lucia` or `both`), `opens_after` (a main or optional mission slug), `closes_at` (a main mission slug or `never`), `sources[]` and an optional `note`; a main mission sets none of them. Any mission may carry an optional `evidence` (as on items: background only, never rendered, ADR 0008). The 33 optional missions entered so far sit after the mains in `missions.yaml`; they have no order of their own, so chapter counts (22/11/26/26/7) and gate orders (20/33/59/84) come from the mains only and never move. `never` is a reserved slug.
- `lib/curated.ts` derives `data.missions` (mains only; the current mission, the picker and `setCurrentMission` read it) and `data.optionalMissions` (`opensAnchor`, the main mission at the end of the `opens_after` chain; `opensOrder`, its order; `closesAt`; `closesOrder`, null for `never`), sorted by `opensOrder`. An optional opens when the player reaches its anchor and closes when they reach `closes_at`. Its gate is the first gate at or after `closes_at`; `never` has none.
- `gates.yaml`: missions that are points of no return, keyed by mission slug, with what you lose (e.g. Tourist Trap → Ultimate Edition vehicles, free roam as Jason). Tourist Trap, Checking Out, The Cartel Heist (the Bayside Safehouse, per Beebom and gta.wiki) and Sunset (free roam, the BuckMe balance, weapons/equipment/outfits and the Y Hotel suite, all temporary) are listed.
- `items/<gate-slug>.yaml`, one file per gate: id, title, category, `before_gate` (the gate's mission slug), `visible_after_mission` (the single visibility field), optional `lost_at_mission`, `verified`, optional `evidence` (`basis`, optional `note`; background only, never rendered, ADR 0008), `how_to`, optional `location`, `sources[]` (url, title, accessed date). Items exist for the four gates (Tourist Trap, Checking Out, The Cartel Heist and Sunset); Unfinished Business has no gate or items (see Open questions).
- Item text (title, how_to, location) names no mission after its `visible_after_mission`, except its own gate's title; earlier cutoffs live only in `lost_at_mission` (ADR 0002, amended 2026-11-26). The app shows "Closes in N missions" / "Do this before your next story mission" from it and from `closes_at` (ADR 0002, second amendment, 2026-11-26); UI not built yet. Optional-mission titles and notes follow the same rule from their `opens_after` anchor, and no gate `lost` entry names a mission. A mission slug and an item id may not collide (`item_checks` stores both under one key); the repository lets an optional mission's slug be ticked like an item.
- `lib/curated.ts` validates all files and the rules across them (known refs, `visible_after` and `lost_at` no later than the gate, `lost_at` not before `visible_after`; for optional missions, a resolvable `opens_after` chain with no cycle, `closes_at` a main mission or `never`, `opens_after` no later than `closes_at`, `closes_at` no later than the last gate) and fails on any issue. `lib/curated-load.ts` reads the files, server only.
- `lib/gates.ts`: `isVisible`, `nextGate` (a gate you're on isn't passed yet), `lockedSummary` (count plus unlock mission, optionals included), `closesIn` (a countdown: `open` N missions, `closed`, or `never`; standing on the closing mission counts as closed), `countdownLabel` (the UI text, null when closed or never), `gateOptionals` (opened, unclosed optionals for a gate, most urgent first), `safeToLeave` (opened optionals that never close), `missionsInChapter` (ids and numbers), `missionTitle`, `pickerChapters`. It never returns titles, except through `missionTitle`. The current mission is always a main mission; an optional slug throws.
- SQLite via Drizzle (`lib/db/schema.ts`, SQL in `drizzle/`, applied by `pnpm db:migrate`; see ADR 0004). Timestamps are ms-epoch integers. Curated ids (mission and item slugs) are plain text with no foreign key; `lib/db/repository.ts` validates them against curated data before writing.
- `progress`: single row (id = 1), created on the first write. `current_mission` is null until onboarding; `spoiler_mode` is `safe` or `open` (default `safe`); `theme` is `system`, `light` or `dark` (default `system`).
- `item_checks`: checked item ids with `checked_at`.
- `stat_levels`: level 0-4 per character × stat (Strength, Cardio, Focus).
- `workouts`: character, stat, at. Any of the three stats can be logged; only Strength and Cardio slip (ADR 0006).
- `sources` (url, title, host, fetched_at) and `candidates` (source, gate and category hints, `raw_extract`, status `new`/`promoted`/`rejected`): scraper-owned, server only, `raw_extract` is never rendered. The repository doesn't expose them yet.
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
- **Scrapers:** a separate small Node CLI in the same repo, run by a timer, with polite rate limits and robots.txt respected (ADR 0007); see the Scraping terms of sources open question for which sources may be fetched.

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
- Scrapers fetch only sources whose terms allow it, within robots.txt and polite rate limits (ADR 0007); the terms findings are in the Scraping terms of sources open question.

## Open questions

Mostly from the 2026-11-25 pre-gate research (all sources are launch-week guides, several single-source or AI-assisted). "Unverified" below means `verified: false` in the data: research background, never shown in the app (ADR 0008).

- **Sunset (gate, mission 84):** free roam only on the gate's lost list, plus the frozen BuckMe balance, weapons/equipment/outfits (returned at the end of Operation Savage Glory in the Pegassi penthouse) and Suite 701 as home (stops at the end of Starting From Zero), all temporary (IGN, PowerPyx, gtabase). Free roam returns at the end of the Honest Abe cutscene, the first time you leave the penthouse after Operation Savage Glory (gtabase, PowerPyx, WarFuel video). The Chapter 4/5 boundary is settled: Starting From Zero ends Chapter 4 and Bird in the Hand opens Chapter 5 (IGN, PowerPyx's full walkthrough, KeenGamer); "moves the story into Chapter 5" on the Sunset pages means no free roam. Still open: manual saves during the stretch (one reporter) and gtasixvicecity's mapping of the point of no return to the mission after Sunset. Item text names none of this.
- **Unfinished Business (Ch5):** no gate or items, and it isn't in KeenGamer's 91-mission list (gtabase, PowerPyx and egamers list it). gtabase says there is no going back, and signing Abe's deal loses checking and pocket cash while Family Savings is protected and returned later (Output Lag and PowerPyx, both read). It is not a recap mission (GTA Explained, Polygon and our Chapter 5 count of 7 agree; Honest Abe and Pay Abe's Fee likewise). Still pending the owner; the mission-kinds change (2026-11-26) didn't decide it.
- **Shitzu Squalo:** Tech4Gamers says it can only be claimed during Chapter 4, at the canal south of Washington Beach by the Y Hotel; KeenGamer agrees on Chapter 4 and egamers also says "only" (gtabase is silent). Likely Ch4-only, not confirmed. No item: how long it stays claimable is unknown.
- **Lock-in start for Tourist Trap:** settled. IGN's first-hand Recalibration and Tourist Trap walkthroughs show free roam after Recalibration; Tourist Trap starts when you approach Lucia (gtabase, Leonipedia, VGC agree). PowerPyx's "last chance" line is templated. `finish-before-recalibration` is verified and has no `lost_at_mission`.
- **Checking balance:** Rock Paper Shotgun, IGN and Playtheory's own save say it's lost at Tourist Trap, so `empty-checking` is verified. Attachments carry over (Playtheory's own save, Jay Dunna) but are per character (Nova Gaming, gameta), which likely explains three unopenable Reddit loss reports. Outfits are disputed (Playtheory says lost; IGN's Tourist Trap walkthrough and KeenGamer say cosmetics carry over, gameta says wardrobe-saved accessories return), so `bought-outfits` is unverified. Ammo has no source.
- **Checking Out carry-over:** registered vehicles are kept but impounded in Port Gellhorn at the start of Chapter 3 (GamesRadar team test; Rare Thief and KeenGamer say kept; Leonida Streets cites KeenGamer). Cash and bank balance are kept (KeenGamer). Registered cars aren't listed as lost.
- **Tourist Trap trigger:** settled. "Take Up Mattia's Offer" is the map marker before the mission starts (IGN's Starting Objective, PowerPyx's walkthrough index, Horizon Gaming footage at 2:58:42), and approaching Lucia starts the mission. Where you meet her varies: PowerPyx says the south Key Lento beach, gtabase says picking her up from work after Kat and Mattia call, IGN says wherever she is.
- **Carry-over:** bought weapons carry past Tourist Trap (Playtheory's own save, Output Lag, several GameFAQs player reports). Ammo is unconfirmed, attachments are disputed (see Checking balance), tattoos and haircuts carry (TheGamer, KeenGamer); clothing is disputed (IGN, TheGamer, KeenGamer say kept, but Playtheory's own save lost bought clothes); registered vehicles are kept but impounded (see Checking Out carry-over); bought garages are only "no loss reported". Owned guns are one shared collection, retrievable by either character from the locker or a trunk (IGN, KeenGamer). Cash on hand is per character; BuckMe is shared (IGN Coffee Break). Attachments are per character (Nova Gaming, first-hand).
- **Relationship:** the meter has four levels; the lowest is Running on Empty, and Jason and Lucia always stay criminal partners. The romance can still end for good through one story choice: the breakup talk appears only at 2/4 or below, and at 1/4 a timeout ends it. Splitting sets "Breakdown", which can't be changed (IGN's Starting From Zero walkthrough; gtabase confirms a breakup exists). To avoid it, be at 3/4 or above when the talk starts. Still open: the talk's mission (IGN says Starting From Zero, gtabase says the start of Protective Custody), the level-2 name (Partners In Crime per VGC and PlayDay, Not So Hot per gtabase, Insider Gaming and KeenGamer), the neglect rate, and which endings Breakdown rules out.
- **Checking Out's $15,000:** `save-fifteen-thousand` is verified (PowerPyx, gtabase, gta6bugs; it is the in-game Prepare for Vice City objective). IGN dissents: it only speeds the unlock. Bank it; pocket cash may not count. Nobody says it is spent. The Starlet Motel's location is settled: Port Gellhorn is a town in Kelly County and the motel sits on its eastern edge (PowerPyx, gta.wiki, IGN, map frames). Still open: whether the motel grounds and pool can be visited after Checking Out (GamesRadar says nothing is locked out; gta.wiki contradicts itself). The objective appears once Coffee Break is reached, so the item shows from Afternoon Delight. No source says the pool weights go, so their loss is disputed.
- **Counts that differ:** Strangers & Freaks totals. The Kyle strawberry boost: Game8 plus a HUD toast say the first strawberry permanently raises max Stamina; later berries add nothing permanent per one round 6 reading (4-untried-modalities#4), shipped as best evidence (ADR 0008). WAiNK is settled at 108 (PowerPyx, IGN, HeistAtlas).
- **Placement that differs:** the Shayna pickup (Ch3 or Ch4; Chapter 4, Lucia only per PowerPyx, but disputed). Bret's hunting line is settled at Chapter 2, after Coffee Break (gtabase, PowerPyx, gta.wiki).
- **'67 Dominator Buggy (Ultimate Edition):** IGN calls the pickup garage the Paradise RV Park; Tech4Gamers says Grassrivers, Mariana County (a purple task about a day after Billy's Thrillbillies), then keep it at the Paradise Garage in Watson Bay. Both names are now in the item, and IGN confirms the Thrillbillies trigger. Shipped as `dominator-buggy`.
- **Motel magazine name:** settled. The cover reads Children of Wizard Wang on screen (Cavaliers Gaming, cross-check); "Wizard Wang" is likely the collectible-list label.
- **Race Against Yago expiry:** a timer ends it, partway through Chapter 3 (Game8 JP, GameWith, gtabase, The Click); no source names a closing mission, so the item keeps the heist as its upper bound and is unverified. Reward settled: $3,800 for first, $1,500 for second; The Tab's pistol claim is an outlier.
- **Meditate with Lucia close:** settled at Chapter 1, lost at the gate (Game8 JP, GameWith, Kamigame, Vandal, KeenGamer, PowerPyx). The offer is one-shot: if you decline it or miss that morning, Lucia doesn't ask again. It isn't needed for the trophy. `balcony-meditation` keeps `lost_at_mission` tourist-trap.
- **Moses pay:** widened. Scan cards show $1,150 (Phoenix) and $7,645 (Dominator), typical early cars about $400 (HarmNone), GTABoom $1,000-$3,000; higher reports are unverified and the cooldown is disputed.
- **Ambulance Chaser (resolved round 6):** one mission, main (Ch2 #2), and missable. IGN says it is lost if Slam Dunk starts first (police find the ambulance), and gtabase agrees. It stays main; the cutoff lives in the Checking Out item `ditch-the-ambulance` (`lost_at_mission` slam-dunk). Still open: whether a missed Ambulance Chaser blocks 100% (gtabase says it is required) or drops from the Story Recap.
- **Mission count:** the app keeps KeenGamer's 91 plus Pool Day (92; KeenGamer omits Pool Day, IGN, PowerPyx and gtabase list it between Another Life and Company Cars). Caught Slipping is a main mission (gtabase, gta.guide, gta.wiki, IGN's Recap-order Chapter 3 list). 91 is KeenGamer, The Tab and Gamer Tweak; 92 is Gfinity; Game Rant says 91 and 92. Polygon's 93 and TalkEsport's are 91 minus Caught Slipping plus Thrillbillies, Twist Wrist, Smash, Grab and Take Out Kitty Litter (Polygon Recap: Kitty Litter Labs); 95 is VGC. Thrillbillies and Twist Wrist, Smash, Grab are optional (save CompletionType 3: counts for story completion and optional tasks), which is why Story Recap lists include them; Take Out Kitty Litter is an optional strand. Save record counts can't settle it (the 100%-story save holds 103 story-type records; multi-part missions write several; seven mains record under other ids). IGN's 18 Chapter 2 mains are KeenGamer's 11 plus Thrillbillies and six Story-list steps (Overnight Charges, Got Pills?, New Look, How Do I Look?, Play Nurse, Behind on Payments); none is optional or missable. Polygon also spells "Zorruso" (typo) and "Starting from Zero"; the game-text title of `steal-the-zorrusso-for-randy` is "Clonin' Keys, Makin' Gs". If 93 wins, Checking Out becomes #35 and The Cartel Heist #61.
- **Bayside timing:** settled. The apartment is literally lost in Ocean Beach, the first Chapter 4 mission (Game8, gtabase, MetaForge; PowerPyx starts Ocean Beach at the apartment). After the heist you can hang out in free roam; Beebom, Wanted State and gta.wiki give the heist as the bound. Items keep the heist bound as the safe line.
- **Strength and Cardio at the chapter change:** one GameSight save shows Strength dropping while Cardio and Focus stay; The Games Wiki says all of Jason's fitness levels drop. `strength` and `cardio` are unverified.
- **Donnie's Drop-Off close:** Game8 puts it later than Game Checklists and The Games Wiki. `donnies-drop-off` is lost at the earlier line and unverified.
- **Coming Home cutoffs:** `house-repairs` (item) closes at Coming Home. `get-lucias-clothes`, `pick-up-groceries`, `buy-flowers` and `get-the-chop` open after Coming Home and close at Clean Up After Donnie: under the reached rule they show only while the player is on Coming Home, before Lucia is collected. `buy-lucia-a-necklace` opens after Coming Home and closes at Clear Skies (IGN Feng Shui; one guide says Tourist Trap, the earlier cutoff is used).
- **Optional missions (mission-kinds, 2026-11-26; round 6 and 7 entries):** 33 entered (kind, character, `opens_after` and `closes_at` supported; `never` stated affirmatively). Entered in round 6/7: `pick-up-groceries`, `buy-flowers`, `get-the-chop`, `clock-out` (opens after Swamped, closes at Don Gone), `find-the-lost-drugs`, `catch-a-bigger-fish`, `search-the-dive-sites`, `the-final-flush`, `retest-freddies-defenses`, `brets-target-decks`, `thrillbillies`, `check-out-mckittrick-farm` (in-game title Aerial Application), `collect-chemicals-for-kyle` (Hazardous Materials), `steal-vehicles-for-moses`, `circles-of-hell`, `join-a-street-race`, `bumper-to-bumper`, `the-unknown-stuntman`, `take-out-kitty-litter`, `spin-on-this`, `mall-rats`, `the-impaler`, `hometown-heroes`, `climbing-the-cellerichain`, `randys-wish-list`, `attend-eddie-acostas-party`. Their items (`kyle-mckittrick`, `night-encounter`, `billy-thrillbillies`, `clock-out`) were removed. Find the Lost Drugs and Donnie's Lost Drugs are two separate missions (four-area swamp search vs one bag in Donnie's sunken boat; PowerPyx, gtabase, IGN). Still not entered. Closing mission not supported: Donnie's Lost Drugs, Impounded Vehicle, This Is a Free Call From... (timed), Pick Up a Gun, Hit Avery Pawn, Collect Felipe's Gift, Brother to Brother, Get Your Wheels, It's a Date!, Dre'Quan's Gift, Dunk's Robbery Tips (title confirmed; opening disputed: after Slam Dunk per IGN and gta.guide, Chapter 3 per PowerPyx), Yasmani's ATM Jobs (timed: each job disappears after 2-3 in-game days, GameWith 583812). Disputed: Meditate with Lucia, Race Against Yago, Donnie's Drop-Off. Staying open after the story unproven or sources missing: Twist Wrist, Smash, Grab (character and `opens_after` unsourced), Hit Kingpin Bowling, Search for Tree Effigies (anchor Search for the Skunk Ape has no READY entry), Search for the Skunk Ape, Help Kirk Find Mr. Mangrove, Collect Moses' Gift, Gellhorn's Missing Tourists, Missing Persons, UFO Abduction, Buddy?, Sisters of the Sea, Yasmani's Jewelry and Payday Loans jobs, That's Where the Money Is..., The Last Mile: Passing the Torch. Not missions: Tail the Security Van (objective 1 of That's Where the Money Is...). Steal Vehicles for Moses' save mapping is unresolved. IGN-only sidebar entries and single-source candidates stay out. Owner decision: no `unknown` `closes_at` value.
- **Left out for spoiler safety:** the Moreland 850 pickup inside Tourist Trap, the burned-house revisit and what to do for Lucia in Checking Out's escape. All are mission content or spoil Tourist Trap, so none fits a gated item. Round 4 adds Checking Out loadout prep, the Cartel Heist vault numbers and the Sunset loadout, which describe gate-mission content.
- Romance is trackable as a level (1-4) plus Breakdown (see Relationship). The criminal profile has five tiers (Professional to Irredeemable) per character; its mechanics and ending effect are unconfirmed. Research.
- **Stat decay:** Strength, Cardio and Focus are per character, each with its own workout windows (IGN, Polygon, howtovideogame first-hand). Focus never decays (IGN, Polygon). Missing a Strength or Cardio window loses progress and can drop a level (IGN; the in-game "Physique has changed due to inactivity" card). Protein halves the recovery (in-game tip). In a partner gym workout (from Coffee Break) the partner completes their own. Window length and loss per miss rest on Polygon alone. Open: whether an unplayable character's windows lapse.
- **Scraping terms of sources (round 6, read 2026-11-26):** GTABase has no terms of use and its robots.txt allows the cited paths (refresh by per-URL lastmod in the sitemap-4seo child sitemaps, seeded from llms.txt; all-rights-reserved footer). IGN (Ziff Davis terms ban robots, scraping and data sets; robots allows /wikis/gta-6/ but the header notice and ~200 AI agents are blocked), Game8 (browse-only licence, no User-agent * group, AI agents blocked), KeenGamer (terms ban automated collection; robots allows /articles/guides/, Cloudflare returns 403 to non-browsers), Polygon (Valnet terms ban scraping and data mining; AI bots blocked) and GameSpot (Content-Signal ai-train=no, 403 to non-browsers) forbid or block automated access: use them as manual citation sources, with RSS feeds only as a person's new-guide alert. gta.wiki: only /w/<Title> pages are allowed by robots.txt and Weird Gloop's terms need prior consent. PowerPyx's robots allows everything but its refresh claims were refuted. ADR 0007 is unchanged; the owner has not set an allowlist.

## Follow-ups (out of scope)

Round 4 evidence tagged READY that is reference data, not a before-gate action, so no item carries it yet: the death and arrest fee ($25 allthings.how, $74 PinnedinLeonida first-hand), body armor prices ($250 and $225), criminal profile tiers (Professional, Hardened, Violent, Psycho, Irredeemable), the Focus tip, fences, trunk outfits, the WAiNK scan, the $20,000 carry cap, the Rockstar 23 Nov patch note (read 2026-11-26: 01.002.002 changes no window or carry-over) and the Key Cloner. Optional-mission data beyond the 33 entered waits on confirmed windows (see Open questions).
