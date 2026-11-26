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
- **Chips:** "Soon lost" for items whose reward or access ends at their `lost_at_mission` (the gate or an earlier mission), "Research" for unverified items. "Soon lost" will carry the "Closes in N missions" text once built.
- **LockedRow:** "4 more unlock after Day Release", naming the mission that unlocks the earliest locked item for the gate. The item count and that mission title show; the content doesn't (ADR 0002).
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

- `chapters` (5) and `missions` (91, KeenGamer's list; the count is disputed, see Open questions, and gtabase counts 109 entries, see the header of `missions.yaml`) live together in `missions.yaml`. List position is the canonical order; order is derived on load and never stored, so it can't disagree with the list. Order is the spoiler gate.
- `gates.yaml`: missions that are points of no return, keyed by mission slug, with what you lose (e.g. Tourist Trap → Ultimate Edition vehicles, free roam as both). Tourist Trap, Checking Out, The Cartel Heist (the Bayside Safehouse, per Beebom and gta.wiki) and Sunset (free roam only) are listed.
- `items/<gate-slug>.yaml`, one file per gate: id, title, category, `before_gate` (the gate's mission slug), `visible_after_mission` (the single visibility field), optional `lost_at_mission`, `verified`, `how_to`, optional `location`, `sources[]` (url, title, accessed date). Items exist for the four gates (Tourist Trap, Checking Out, The Cartel Heist and Sunset); Unfinished Business has no gate or items (see Open questions).
- Item text (title, how_to, location) names no mission after its `visible_after_mission`, except its own gate's title; earlier cutoffs live only in `lost_at_mission` (ADR 0002, amended 2026-11-26). The app will later show "Closes in N missions" / "Do this before your next story mission" from it; UI is out of scope.
- `lib/curated.ts` validates all files and the rules across them (known refs, `visible_after` and `lost_at` no later than the gate, `lost_at` not before `visible_after`) and fails on any issue. `lib/curated-load.ts` reads the files, server only.
- `lib/gates.ts`: `isVisible`, `nextGate` (a gate you're on isn't passed yet), `lockedSummary` (count plus unlock mission), `missionsInChapter` (ids and numbers), `missionTitle`, `pickerChapters`. It never returns titles, except through `missionTitle`.
- SQLite via Drizzle (`lib/db/schema.ts`, SQL in `drizzle/`, applied by `pnpm db:migrate`; see ADR 0004). Timestamps are ms-epoch integers. Curated ids (mission and item slugs) are plain text with no foreign key; `lib/db/repository.ts` validates them against curated data before writing.
- `progress`: single row (id = 1), created on the first write. `current_mission` is null until onboarding; `spoiler_mode` is `safe` or `open` (default `safe`); `theme` is `system`, `light` or `dark` (default `system`).
- `item_checks`: checked item ids with `checked_at`.
- `stat_levels`: level 0-4 per character × stat (Strength, Cardio, Focus).
- `workouts`: character, stat, at. Any of the three stats can be logged; only Strength and Cardio slip (ADR 0006).
- `sources` (url, title, host, fetched_at) and `candidates` (source, gate and category hints, `raw_extract`, status `new`/`promoted`/`rejected`): scraper-owned, server only, `raw_extract` is never rendered. The repository doesn't expose them yet.
- Romance and criminal profile get their own tables once research shows what's trackable.

## Data sources and refresh

- **Curated (in repo):** `data/curated/*.yaml` covers missions, gates and items I've verified. It's the source of truth and is reviewed by hand.
- **Scraped (server only):** scrapers fetch guide pages and store raw extracts with URL and fetch time in the server database. Nothing scraped is committed.
- **Merge:** scraped facts become _candidates_, and are promoted to curated after review. The app shows only curated items plus clearly flagged candidates ("needs research").
- **Refresh:** manual runs, plus a light weekly systemd timer with Discord alerts while launch-period guides are still changing.
- **Spoiler safety:** every item needs a `visible_after_mission`. Scraped text is never shown raw, because guide pages mix later spoilers in.

## Architecture

- **App:** Next.js (App Router) + TypeScript, server components, with server actions for writes. Installable PWA, phone-first.
- **Database:** on the server (SQLite with Drizzle, one file on a volume, since it's a single user on a small box; see ADR 0004).
- **Hosting:** docker compose on the Hetzner VPS behind a Cloudflare Tunnel with Cloudflare Access (Google SSO) at gta.dvdby.cc. CD runs from GitHub Actions.
- **Scrapers:** a separate small Node CLI in the same repo, run by a timer, with polite rate limits and robots.txt respected (ADR 0007).

## Risks

- **Scraping terms:** some guide sites forbid it. Keep the data private, attribute sources, and prefer sites that allow it (open question).
- **Launch-week accuracy:** guides disagree and update daily. Hence the verified flag and source links.
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

Mostly from the 2026-11-25 pre-gate research (all sources are launch-week guides, several single-source or AI-assisted).

- **Sunset (gate, mission 83):** added as a gate with free roam only on its lost list (PowerPyx says most missions after it run before open world; gtabase's wording is "moves the story into Chapter 5; finish side activities first", not "point of no return", so the free-roam lock rests on PowerPyx alone and is provisional). Still open: the exact end of the closed stretch (GTA6BUGS and Leonida Hub say Honest Abe, PowerPyx only says "most"), manual saves (one reporter), BuckMe checking frozen at $0 until Operation Savage Glory (gameta, Leonida Hub, gta6helphub), weapons, equipment and outfits taken and returned (PowerPyx; where they are taken is unconfirmed), Suite 701 as a base (RetroBroker says it stops, gta6helphub says it stays your home until Ch4 ends), gtasixvicecity mapping the point of no return to the mission after Sunset, and the Chapter 4/5 boundary (PowerPyx says Sunset starts Chapter 5, KeenGamer puts one more mission in Chapter 4). Item text names none of this.
- **Unfinished Business (Ch5):** no gate or items, and it isn't in KeenGamer's 91-mission list (gtabase, PowerPyx and egamers list it). gtabase says there is no going back, and signing Abe's deal loses checking and pocket cash while Family Savings is protected and returned later (Output Lag and PowerPyx, both read). It is not a recap mission (GTA Explained, Polygon and our Chapter 5 count of 7 agree; Honest Abe and Pay Abe's Fee likewise). It waits for the mission-kinds PR.
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
- **Ambulance Chaser:** missions.yaml has it as a main mission (Ch2 #2); gtabase and The Click list a Slam Dunk cutoff for an entry of that name, and whether it is the same mission or a separate job is unclear. Deferred to the mission-kinds PR.
- **Mission count:** the app keeps KeenGamer's 91 (also The Tab, Gamer Tweak). 92 is Gfinity, and Game Rant says 91 in its lede and 92 in its intro. 93 is Polygon ("as listed in the Story Recap") and TalkEsport, which add Thrillbillies, Twist Wrist, Smash, Grab and Kitty Litter Labs and drop Caught Slipping; 95 is VGC, which adds the same three and keeps Caught Slipping. Game Rant and gtabase tag Billy's two jobs Optional, gtabase and gta6bugs tag Kitty Litter Labs Optional, and The Tab says it leaves out Optional-tagged entries; those lists keep Caught Slipping main. Polygon also spells "Zorruso" and "Starting from Zero". Round 4 found no completed in-game Story Recap; gtabase, gta.guide and gta.wiki keep Caught Slipping as a main mission, and 93 and 95 include optional entries. If 93 wins, Checking Out becomes #35 and The Cartel Heist #61.
- **Bayside timing:** gtabase says the apartment is reachable after the heist and is lost when the next chapter starts; Beebom, Wanted State, gta6playertools and gta6heists put the loss at or right after the heist. Items keep the heist bound.
- **Strength and Cardio at the chapter change:** one GameSight save shows Strength dropping while Cardio and Focus stay; The Games Wiki says all of Jason's fitness levels drop. `strength` and `cardio` are unverified.
- **Donnie's Drop-Off close:** Game8 puts it later than Game Checklists and The Games Wiki. `donnies-drop-off` is lost at the earlier line and unverified.
- **Coming Home cutoffs:** `lucias-necklace`, `house-repairs` and `get-lucias-clothes` now close at Coming Home.
- **Left out for spoiler safety:** the Moreland 850 pickup inside Tourist Trap, the burned-house revisit and what to do for Lucia in Checking Out's escape. All are mission content or spoil Tourist Trap, so none fits a gated item. Round 4 adds Checking Out loadout prep, the Cartel Heist vault numbers and the Sunset loadout, which describe gate-mission content.
- How the romance/relationship and criminal profile systems work, and what's trackable. Research.
- How stat decay works.

## Follow-ups (out of scope)

Round 4 evidence tagged READY that is reference data, not a before-gate action, so no item carries it yet: the death and arrest fee ($25 allthings.how, $74 PinnedinLeonida first-hand), body armor prices ($250 and $225), criminal profile tiers (Professional, Hardened, Violent, Psycho, Irredeemable), the Focus tip, fences, trunk outfits, the WAiNK scan, the $20,000 carry cap, the Rockstar 23 Nov patch note and the Key Cloner. Mission-kinds data (opens_after and closes_at for optional missions) is a later PR.
