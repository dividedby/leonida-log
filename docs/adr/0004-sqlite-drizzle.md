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
