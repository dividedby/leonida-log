# CLAUDE.md

Leonida Log: phone-first, spoiler-gated GTA 6 guide at gta.dvdby.cc. Read CONTEXT.md and docs/adr/ first; they beat memory. Screens and components follow the [design reference](https://claude.ai/artifact/FL8isDnFAyobGqPrkFeb9W), the visual source of truth; docs/design.md and docs/branding.md are its written form.

## Commands

Node 26 (CI and the production image).

- `pnpm dev`: run the app locally
- `pnpm build`: production build
- `pnpm test`: Vitest
- `pnpm lint`: ESLint
- `pnpm typecheck`: `tsc --noEmit`
- `pnpm db:generate`: write a Drizzle migration from `lib/db/schema.ts` into `drizzle/` (commit it)
- `pnpm db:migrate`: apply migrations to `DATABASE_PATH` (explicit; the app and scrapers never migrate)
- `pnpm scrape [--source x[,y]] [--since YYYY-MM-DD] [--report-only] [--dry-run]`: run the scrapers and write the changed-since report (see scrapers/README.md). `--feed-only` polls only KeenGamer's feed, no report. `--purge <source>` deletes a source's pages and candidates; `--wayback <url[*]>` lists Wayback captures
- `pnpm format` / `pnpm format:check`: Prettier (tool defaults, `.prettierrc.json` is `{}`)

## Rules

- pnpm only. Next.js + TypeScript. Vitest for tests; gating logic is test-first.
- Never render content past the user's current mission. Every item needs `visible_after_mission`.
- `data/curated` is the source of truth and is committed. Scraped data lives only in the server DB: never commit it, never render it raw.
- Scrapers: any source, but polite rate limits, respect robots.txt, light enough for a small VPS (ADR 0007).
- No Rockstar logos, GTA VI wordmark, screenshots or key art in the repo.
- Public repo: only the handle dividedby; no real names or emails. Secrets live in env files, never in code.
- Follow branding (Postcard: Anton + Work Sans, sunset pink / orange / Gulf teal) in docs/branding.md. Component names match the design reference.
- Deploys go through CD; don't hand-copy to the server. The root-run host files under `deploy/` and `compose.yaml` are the exception: the owner installs them by hand (`deploy/README.md`). Don't call something fixed until it has run for real.
- Migrations must stay readable by the previous release: a failed deploy rolls back the image, not the database. Expand first (add), contract in a later deploy (drop, rename, tighten).

## Workflow

- Trunk-based: `feature/*` → PR → `main` (prod). No staging environment, so no staging branch.
- Merge commits only. CHANGELOG.md `## [Unreleased]` is updated in the same PR as the change.
- Issues follow docs/agents/issue-tracker.md and docs/agents/triage-labels.md; loose ideas go to the Idea Inbox issue (docs/agents/idea-inbox.md).
