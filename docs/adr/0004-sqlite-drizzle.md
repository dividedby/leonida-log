# 4. SQLite + Drizzle on the VPS

Date: 2026-11-25
Status: Accepted

## Context

One user, a small VPS, and modest data (91 missions, hundreds of items, a workout log, scraped candidates).

## Decision

Use SQLite via better-sqlite3 with Drizzle ORM and Drizzle migrations. The DB is one file at `DATABASE_PATH` on a compose volume, backed up with the host's usual jobs. Curated YAML is loaded and validated at build or start; user progress, workouts and candidates live in the DB.

## Consequences

- No separate DB service to run.
- Single writer: the app and the scraper CLI must not hold long write transactions; WAL mode on.
- Multi-user would mean revisiting this (Postgres).

## Migrations (2026-11-25)

- Migrations never run at app start, and the scraper never migrates. They run through one explicit step, `pnpm db:migrate` (`scripts/migrate.mjs`: plain Node, Drizzle's better-sqlite3 migrator, reads `DATABASE_PATH`). Deploy runs it before starting the app.
- drizzle-kit is a dev tool only, used by `pnpm db:generate`; the generated SQL in `drizzle/` is committed.
- Curated mission and item ids are stored as plain text with no foreign key (curated data is YAML, not in the DB). `lib/db/repository.ts` validates them before writing.
