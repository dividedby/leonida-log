# CLAUDE.md

Leonida Log: phone-first, spoiler-gated GTA 6 guide at gta.dvdby.cc. Read CONTEXT.md and docs/adr/ first; they beat memory. Screens and components follow the [design reference](https://claude.ai/artifact/FL8isDnFAyobGqPrkFeb9W), the visual source of truth; docs/design.md and docs/branding.md are its written form.

## Commands

Land with the v1 app scaffold; until then the repo is docs only.

- `pnpm dev`: run the app locally
- `pnpm test`: Vitest
- `pnpm lint`: ESLint
- `pnpm typecheck`: `tsc --noEmit`
- `pnpm format:check`: Prettier (tool defaults, `.prettierrc.json` is `{}`)
- `pnpm scrape <source>`: run one scraper against the local database

## Rules

- pnpm only. Next.js + TypeScript. Vitest for tests; gating logic is test-first.
- Never render content past the user's current mission. Every item needs `visible_after_mission`.
- `data/curated` is the source of truth and is committed. Scraped data lives only in the server DB: never commit it, never render it raw.
- Scrapers: any source, but polite rate limits, respect robots.txt, light enough for a small VPS (ADR 0007).
- No Rockstar logos, GTA VI wordmark, screenshots or key art in the repo.
- Public repo: only the handle dividedby; no real names or emails. Secrets live in env files, never in code.
- Follow branding (Postcard: Anton + Work Sans, sunset pink / orange / Gulf teal) in docs/branding.md. Component names match the design reference.
- Deploys go through CD; don't hand-copy to the server. Don't call something fixed until it has run for real.

## Workflow

- Trunk-based: `feature/*` → PR → `main` (prod). No staging environment, so no staging branch.
- Merge commits only. CHANGELOG.md `## [Unreleased]` is updated in the same PR as the change.
- Issues follow docs/agents/issue-tracker.md and docs/agents/triage-labels.md; loose ideas go to the Idea Inbox issue (docs/agents/idea-inbox.md).
