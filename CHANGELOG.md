# Changelog

Tracked surfaces: the Leonida Log web app (`app/`, `components/`, `lib/`), curated data (`data/curated/`), scrapers (`scrapers/`), deploy (`Dockerfile`, `compose.yaml`, `.github/workflows/`), and docs (`CLAUDE.md`, `CONTEXT.md`, `docs/`, root markdown).

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).

## [Unreleased]

### Added

- Curated data from the Perplexity companion research (cross-checked in `research_notes/perplexity/`): The Cartel Heist as a third gate (the Bayside Safehouse is lost, per Beebom and gta.wiki) with `items/the-cartel-heist.yaml` (7 items: Vanessa's laptop, the Bayside books, Halifax, Race Against Yago, Monty's pistol, Gil's Kalinga .50, Boobie's red bag); two Tourist Trap items (Lucia's necklace, Ring the Bell!) and three Checking Out items (register a car, Avery Pawn and Kingpin Bowling jobs, the '67 Dominator Buggy). Sunset and Unfinished Business still get no gate; Open questions in docs/design.md record the evidence, the Dominator Buggy garages and the likely Ch4-only Squalo.
- Curated data from the 2026-11-25 pre-gate research: `items/checking-out.yaml` (10 sourced items: $15,000 and the other Chapter 2 missions, the motel's cards and storage, Moses car sales, Focus at Rodgers Ranch, the secret midnight encounter, and the Billy, Kyle and Bret side jobs) and 11 new Tourist Trap items (Family Savings goal, spend on weapons, empty checking, floor stash, skip car upgrades, collections overview, house magazines, Donnie's H&L .38, house repairs, relationship building, approach Lucia last). Sunset and Unfinished Business get no gate (single source); the conflicts are listed under Open questions in docs/design.md.
- `missions.yaml` header records where gtabase orders missions differently and why its 109-entry count isn't used.
- Database: Drizzle schema (`progress`, `item_checks`, `stat_levels`, `workouts`, `sources`, `candidates`) in `lib/db/`, committed SQL migration in `drizzle/`, better-sqlite3 client (WAL), a small repository API that validates mission and item slugs against curated data, and integration tests on temp-file databases. `pnpm db:generate` writes migrations; `pnpm db:migrate` applies them from `DATABASE_PATH` and is idempotent. ADR 0004 records that migrations never run at app start.
- Curated data and spoiler gating: zod-validated YAML in `data/curated/` (5 chapters, 91 missions, Tourist Trap and Checking Out gates, Tourist Trap items with sources), `lib/curated.ts` and `lib/curated-load.ts`, and pure gating functions in `lib/gates.ts` (visibility, next gate, locked summary, spoiler-safe picker helpers), test-first.
- ADR 0002 amended with two dated naming exceptions: the unlock mission in the locked row and the next gate on the exit sign.
- Next.js (App Router) + TypeScript app skeleton with pnpm, ESLint, Prettier, Vitest and `tsc --noEmit`, and a blank Postcard shell (Anton + Work Sans, palette tokens with dark mode).
- CI: `changes`, lint, typecheck, test, build, gitleaks and the `ci-ok` gate; `format` workflow; Dependabot for GitHub Actions and npm.
- v1 plan (docs/plans/v1.md), approved.
- Repo scaffold: CLAUDE.md, CONTEXT.md glossary, design and branding docs, ADRs 0001-0007, agent docs and the Idea Inbox template.

### Changed

- Curated corrections from the Perplexity cross-check: `empty-checking` is verified (Rock Paper Shotgun and allthings.how both say checking is lost) and the Tourist Trap `lost` list adds the checking balance; `approach-lucia-last` and `manual-save` now say the free roam after Recalibration is the last and the point of no return starts when you go to Lucia (both PowerPyx pages); `floor-stash` notes Jason's $5,000 Rainy Day lockbox isn't gone for good; `motel-cards` lists three cards (adding Bryson Powers) and two magazines; the Ultimate Edition vehicles item adds the Ganado Retro Build. Registered cars at Checking Out stay out of `lost` because sources conflict.
- Tourist Trap items corrected from the research: 18 card sets with 480 cards (not 18 cards), cards sell at pawn shops, Family Savings and pocket cash split into separate items (pockets go to BuckMe at an ATM, not Family Savings), Shirley's two hourglass missions now list the sourced details and conflicts, and the balcony meditation is a verified nice-to-do (Positive Mental Attitude doesn't depend on it, per PSNProfiles player reports and PowerPyx). Items resting only on an AI-drafted source (The Games Wiki) are now `verified: false`, and the rule is stated at the top of each items file and gates.yaml. Player reports settle that bought weapons carry past Tourist Trap and that the floor stash is lost. The Tourist Trap `lost` list adds the floor stash and Jason's vehicles.
