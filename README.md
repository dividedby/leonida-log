# Leonida Log

A phone-first, spoiler-gated guide to GTA 6, built around where you are in the story: what to do before each point of no return, and how to go into the next chapter as strong as possible. It lives at gta.dvdby.cc.

Status: v1 in development. App skeleton in place; features land per [docs/plans/v1.md](docs/plans/v1.md).

## v1

- **Story position:** set your current mission. Nothing past it renders.
- **Before you move on:** a checklist for each point of no return, starting with Tourist Trap, grouped by category.
- **Stats:** Strength, Cardio and Focus for Jason and Lucia, with a manual workout log.
- **Romance and criminal profile:** research-first sections that fill in as data is curated.
- The map comes in v2.

## Docs

- [docs/design.md](docs/design.md): goals, screens, data model, architecture
- [docs/branding.md](docs/branding.md): name, logo, palette, type, voice
- [docs/plans/v1.md](docs/plans/v1.md): v1 delivery plan, one PR per step
- [docs/adr/](docs/adr/): decisions
- [CONTEXT.md](CONTEXT.md): glossary
- [Design reference](https://claude.ai/artifact/FL8isDnFAyobGqPrkFeb9W): the visual source of truth

## Development

Node 24 and pnpm.

```sh
pnpm install
DATABASE_PATH=data/local.db pnpm db:migrate
pnpm dev
pnpm test
```

The database is one SQLite file at `DATABASE_PATH`. Migrations never run at app start: run `pnpm db:migrate` after `pnpm install` and after pulling a new migration. After changing `lib/db/schema.ts`, run `pnpm db:generate` and commit the SQL in `drizzle/`.

## Data

Curated, verified data lives in `data/curated/` and is committed: `missions.yaml` (chapters and missions in story order), `gates.yaml` (points of no return) and `items/<gate>.yaml` (checklist items, each with sources). It is validated on load and in tests, so an item without `visible_after_mission` fails the tests. Scrapers in `scrapers/` enrich a database that stays on the server; scraped text is never committed or shown raw.

## Not affiliated

Leonida Log is a fan-made guide. It is not affiliated with or endorsed by Rockstar Games or Take-Two Interactive, and it uses no official logos or art.

## License

[MIT](LICENSE)
