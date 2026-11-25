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
- **ExitSign** for the next point of no return: "EXIT 20 · Tourist Trap · 3 of 6 done".
- **StatStrip:** a compact strip with one slim row per character and three mini rings, tapping through to Stats. It's smaller than the round 2 mockup, per the feedback that the 3-stat card takes up too much space.
- **Up next:** 1-3 open ChecklistRows, with Chips such as "Soon lost".
- **Tab bar:** Story, Checklist, Stats, More. Map stays hidden until v2.

### Before you move on (checklist)

This is round 2, option A.

- **PostcardHeader:** the Tourist Trap name and "3 of 6 done".
- **CategoryHeader** for each category, with counts (Stats 2/2, Vehicles 0/1, Focus 0/1, Collectibles 1/1, Money 0/1), and ChecklistRows under each.
- **Chips:** "Soon lost" for items you lose at the gate, "Research" for unverified items.
- **LockedRow:** "4 more unlock after Day Release". The item count shows; the content doesn't.
- Each item opens a detail sheet with how-to, location text and source links.

### Stats

This is round 1, option A.

- One card per character, with StatRings for Strength, Cardio and Focus and "Last workout: 2 days ago".
- A "Log a workout" PrimaryButton, a tip that Strength and Cardio can slip while Focus levels stay, and how-to links per stat.

### More

- Romance / relationships, criminal profile, story position picker, and settings (theme, spoiler mode).

### Flows

1. **First run:** pick the current mission (chapter, then mission, both spoiler-safe) and land on Home.
2. **Play session:** open Home, tick items, and log a workout.
3. **Hitting a point of no return:** finish the list and mark the mission done. The next gate's checklist unlocks.

## Data model (sketch)

- `chapters` (5) and `missions` (91, ordered). These are the spoiler gates.
- `gates`: missions that are points of no return, with what you lose (e.g. Tourist Trap → Ultimate Edition vehicles, free roam as both).
- `items`: title, category, `before_gate`, `visible_after_mission`, `lost_at_mission`, `verified`, `sources[]`.
- `stats` (per character × stat level) and `workouts` (character, stat, at).
- `progress`: current mission, item checks.
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

- What exactly carries over into Chapter 2 (money, weapons, vehicles)? Research.
- How the romance/relationship and criminal profile systems work, and what's trackable. Research.
- How stat decay works.
