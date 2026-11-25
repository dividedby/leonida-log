# Changelog

Tracked surfaces: the Leonida Log web app (`app/`, `components/`, `lib/`), curated data (`data/curated/`), scrapers (`scrapers/`), deploy (`Dockerfile`, `compose.yaml`, `.github/workflows/`), and docs (`CLAUDE.md`, `CONTEXT.md`, `docs/`, root markdown).

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).

## [Unreleased]

### Added

- Curated data and spoiler gating: zod-validated YAML in `data/curated/` (5 chapters, 91 missions, Tourist Trap and Checking Out gates, Tourist Trap items with sources), `lib/curated.ts` and `lib/curated-load.ts`, and pure gating functions in `lib/gates.ts` (visibility, next gate, locked summary, spoiler-safe picker helpers), test-first.
- ADR 0002 amended with two dated naming exceptions: the unlock mission in the locked row and the next gate on the exit sign.
- Next.js (App Router) + TypeScript app skeleton with pnpm, ESLint, Prettier, Vitest and `tsc --noEmit`, and a blank Postcard shell (Anton + Work Sans, palette tokens with dark mode).
- CI: `changes`, lint, typecheck, test, build, gitleaks and the `ci-ok` gate; `format` workflow; Dependabot for GitHub Actions and npm.
- v1 plan (docs/plans/v1.md), approved.
- Repo scaffold: CLAUDE.md, CONTEXT.md glossary, design and branding docs, ADRs 0001-0007, agent docs and the Idea Inbox template.
