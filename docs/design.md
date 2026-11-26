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
- **Chips:** "Soon lost" for items you lose at the gate, "Research" for unverified items.
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

- `chapters` (5) and `missions` (91, KeenGamer's list; gtabase counts 109 entries, see the header of `missions.yaml`) live together in `missions.yaml`. List position is the canonical order; order is derived on load and never stored, so it can't disagree with the list. Order is the spoiler gate.
- `gates.yaml`: missions that are points of no return, keyed by mission slug, with what you lose (e.g. Tourist Trap → Ultimate Edition vehicles, free roam as both). Tourist Trap, Checking Out and The Cartel Heist (the Bayside Safehouse, per Beebom and gta.wiki) are listed.
- `items/<gate-slug>.yaml`, one file per gate: id, title, category, `before_gate` (the gate's mission slug), `visible_after_mission` (the single visibility field), optional `lost_at_mission`, `verified`, `how_to`, optional `location`, `sources[]` (url, title, accessed date). Items exist for Tourist Trap, Checking Out and The Cartel Heist; Sunset and Unfinished Business have no gate or items (see Open questions).
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

- **Sunset (Ch4):** no gate or items. gtabase and gtasixvicecity call it a point of no return, but no source documents a loss. The only claim is GTACulture's (one source): pre-Chapter-5 weapons, equipment and outfits are unavailable until Operation Savage Glory ends. gtasixvicecity puts the point of no return on the mission after Sunset, so sites map it to different missions. The Y Hotel Suite 701 as the Ch4 home is a gta.wiki entry with no lock condition.
- **Unfinished Business (Ch5):** no gate or items, and it isn't in KeenGamer's 91-mission list (gtabase, PowerPyx and egamers list it). gtabase, GTAScoop and HeistAtlas agree it follows the $150,000 Pay Abe's Fee via BuckMe, ends when you return to Abe's office, and is a point of no return. The only loss they describe is pocket cash and withdrawing from Family Savings, a liquidity lock rather than a loss. Revisit if it joins the mission list or a loss is documented.
- **Shitzu Squalo:** Tech4Gamers says it can only be claimed during Chapter 4, at the canal south of Washington Beach by the Y Hotel; KeenGamer agrees on Chapter 4 and egamers also says "only" (gtabase is silent). Likely Ch4-only, not confirmed. No item, as Chapter 4 has no gate.
- **Lock-in start for Tourist Trap:** PowerPyx's Recalibration page calls the free roam after Recalibration the last in Chapter 1, and its Tourist Trap page says the lock starts when you go to Lucia (VGC and gtabase also name Tourist Trap). Some guides (completegta6) advise treating Recalibration as the deadline. Items say the next free roam after Recalibration is the last and the point of no return starts when you go to Lucia. No first-hand report confirms either.
- **Checking balance:** Rock Paper Shotgun and allthings.how both say it's lost at Tourist Trap, so `empty-checking` is verified. Neither is a before/after test. Attachment loss is Reddit-only (unverified) and ammo is uncovered.
- **Checking Out carry-over:** Leonida Streets says cash, bank balance and registered vehicles are kept; one unverified Reddit comment says registered cars are impounded. Registered cars aren't listed as lost.
- **Tourist Trap trigger:** the same moment under two names. "Take Up Mattia's Offer" is the map marker, and approaching Lucia starts the mission. The marker name is from The Games Wiki only, so that item is unverified.
- **Carry-over:** bought weapons carry past Tourist Trap (several GameFAQs player reports plus the owned-weapon rules in guides). Ammo and attachments are unconfirmed, clothing and tattoos carry per gta6story.org and allthings.how, and registered vehicles are disputed (see Checking Out carry-over); bought garages are only "no loss reported".
- **Relationship:** launch guides say no permanent breakup (lowest level is Running on Empty); VGC and games.gg say neglect locks one ending, mechanism unknown. The level-2 name is Partners In Crime (VGC, PlayDay) or Not So Hot (gtabase, Insider Gaming, KeenGamer).
- **Checking Out's $15,000:** no source says whether it's spent or whether pocket cash counts. The Starlet Motel's location is also disputed (Port Gellhorn vs Kelly County).
- **Counts that differ:** WAiNK scans (108 or 112), missions (91 or 109), Strangers & Freaks totals, and the Kyle strawberry boost (temporary or permanent).
- **Placement that differs:** the Shayna pickup (Ch3 or Ch4) and Bret's hunting line (Ch2 or after it).
- **'67 Dominator Buggy (Ultimate Edition):** Tech4Gamers says to collect it at the marked Grassrivers garage in Mariana County (a purple task about a day after Billy's Thrillbillies) and keep it at the Paradise Garage in Watson Bay; Perplexity says Leonipedia agrees, which wasn't checked. That reconciles the earlier garage dispute; a "Paradise RV Park" name in one guide couldn't be traced. Shipped as `dominator-buggy`.
- **Left out for spoiler safety:** the Moreland 850 pickup inside Tourist Trap and what to do for Lucia in Checking Out's escape. Both are mission content, so neither fits a gated item.
- How the romance/relationship and criminal profile systems work, and what's trackable. Research.
- How stat decay works.
