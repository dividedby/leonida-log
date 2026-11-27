# 3. Curated data in repo, scraped data on server

Date: 2026-11-25
Status: Accepted. Amended 2026-11-26 by [ADR 0008](0008-best-evidence.md): candidates flagged "needs research" no longer show; curated entries carry the best-evidence value, unlabelled.

## Context

Data comes from hand-verified research plus scraping many guide sites and databases. The repo is public; scraped text is other people's content and may contain spoilers.

## Decision

Curated data lives in `data/curated/*.yaml`, validated with zod, and is committed: it's the source of truth. Scrapers and the schema are public. Scraped extracts (with URL and fetch time) live only in the server database as candidates. A candidate is promoted to curated by hand review. The app renders curated items only, never candidates or raw scraped text.

## Consequences

- Nothing scraped is ever committed; `.gitignore` covers local DB files.
- Every curated item cites sources.
- A candidate's display text is written or reviewed by hand before it shows.
