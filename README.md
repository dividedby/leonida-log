# Leonida Log

A phone-first, spoiler-gated guide to GTA 6, built around where you are in the story: what to do before each point of no return, and how to go into the next chapter as strong as possible. It lives at gta.dvdby.cc.

Status: v1 in development. App skeleton, design system, onboarding, Home, the checklist, Stats and More are in place; the rest lands per [docs/plans/v1.md](docs/plans/v1.md).

## v1

- **Story position:** set your current mission. Nothing past it renders.
- **Before you move on:** a checklist for each point of no return, starting with Tourist Trap, grouped by category.
- **Stats:** Strength, Cardio and Focus (levels 0-4) for Jason and Lucia, set by tapping a ring.
- **Romance and criminal profile:** research-first sections that fill in as data is curated; they read "Research in progress" until then.
- **Settings:** theme (system, light or dark).
- **Map:** the checklist placed by area on an original schematic of Leonida; tap a reached area for its sheet. Rows show their area inline, and detail pages link to it.

## Docs

- [docs/design.md](docs/design.md): goals, screens, data model, architecture
- [docs/branding.md](docs/branding.md): name, logo, palette, type, voice
- [docs/plans/v1.md](docs/plans/v1.md): v1 delivery plan, one PR per step
- [docs/sources.md](docs/sources.md): source ranking, copy chains and which sites get a scraper
- [docs/adr/](docs/adr/): decisions
- [CONTEXT.md](CONTEXT.md): glossary
- [Design reference](https://claude.ai/artifact/FL8isDnFAyobGqPrkFeb9W): the visual source of truth

## Development

Node 26 and pnpm.

```sh
pnpm install
DATABASE_PATH=data/local.db pnpm db:migrate
DATABASE_PATH=data/local.db pnpm dev
pnpm test
```

Routes: `/` (Home; redirects to `/onboarding` until a story position is saved), `/onboarding` (story position picker), `/checklist` (the next point of no return's list; ticked rows stay listed so they can be unticked, and it has the "Mark mission done" control), `/checklist/item/[id]` (a row's detail sheet, only for visible content), `/done` (confirmation before moving on from a point of no return), `/stats` (tap a ring to set a level), `/more` (story position, the research sections and the theme setting), `/components` and `/api/health`. The app reads the database per request and never migrates it, so run `pnpm db:migrate` against `DATABASE_PATH` before `pnpm dev`, with `DATABASE_PATH` set for both (`.env.example` names it).

`/components` (noindex) shows every UI component in light and dark at 375px. The PWA icons in `public/icons/` are committed; after changing `app/icon.svg`, regenerate them with `node scripts/make-icons.mjs`.

## Scrapers

`scrapers/` watches eight sources (the guide sites PowerPyx, GTABase, IGN, KeenGamer, Game8 JP, GameWith and Vandal, plus datamine files in public GitHub repos through the GitHub REST API) for new and changed pages and writes candidates to the server database, never to the repo. It respects robots.txt, spaces requests per host and uses no headless browser.

```sh
DATABASE_PATH=data/local.db pnpm scrape --dry-run              # fetch and diff, write nothing
DATABASE_PATH=data/local.db pnpm scrape --source powerpyx      # one source
DATABASE_PATH=data/local.db pnpm scrape --report-only --since 2026-11-20
DATABASE_PATH=data/local.db pnpm scrape --purge ign             # drop a source's pages and candidates
DATABASE_PATH=data/local.db pnpm scrape --feed-only            # poll KeenGamer's feed only (the server does this every 4 hours)
pnpm scrape --wayback 'keengamer.com/articles/guides/gta-6-*'  # list Wayback captures, no DB
```

Each run writes `data/scraped/reports/changed-since-<date>.md` (and `latest.md`) for the weekly research pass. Switches, env vars and how to add a source are in [scrapers/README.md](scrapers/README.md).

The database is one SQLite file at `DATABASE_PATH`. Migrations never run at app start: run `pnpm db:migrate` after `pnpm install` and after pulling a new migration. After changing `lib/db/schema.ts`, run `pnpm db:generate` and commit the SQL in `drizzle/`.

## Deploy

A merge to `main` deploys. `.github/workflows/deploy-vps.yml` re-runs typecheck, lint and tests, builds one image (`Dockerfile`) on an arm64 runner, smoke-tests it, pushes `ghcr.io/dividedby/leonida-log:<sha>`, then tells the VPS over SSH to run that SHA with `compose.yaml`: pull, snapshot the database, migrate, start, and roll back to the previous image if `/api/health` does not report the new SHA. The app listens on `127.0.0.1:5100` behind a Cloudflare Tunnel and Access. A migration must stay readable by the previous release (expand first, contract in a later deploy). The root-run host files are installed by the owner by hand; the runbook is [deploy/README.md](deploy/README.md), the decisions are in [ADR 0005](docs/adr/0005-hosting.md).

`GET /api/health` answers `{"ok":true,"revision":"<sha>"}` once the database has its schema, and 503 otherwise.

## Data

Curated data at its current best-evidence value (ADR 0008) lives in `data/curated/` and is committed: `missions.yaml` (chapters, the 92 main missions in story order, and optional missions with when they open and close), `gates.yaml` (points of no return), `areas.yaml` (the map regions and when each becomes visible) and `items/<gate>.yaml` (checklist items, each with sources). It is validated on load and in tests, so an item without `visible_after_mission` fails the tests. Scrapers in `scrapers/` enrich a database that stays on the server; scraped text is never committed or shown raw.

## Not affiliated

Leonida Log is a fan-made guide. It is not affiliated with or endorsed by Rockstar Games or Take-Two Interactive, and it uses no official logos or art.

## License

[MIT](LICENSE)
