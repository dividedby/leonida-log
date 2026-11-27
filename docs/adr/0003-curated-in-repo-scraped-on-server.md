# 3. Curated data in repo, scraped data on server

Date: 2026-11-25
Status: Accepted. Amended by [ADR 0008](0008-best-evidence.md): curated entries carry the best-evidence value and nothing is flagged "needs research" in the app.

## Context

Data comes from hand-verified research plus scraping many guide sites and databases. The repo is public; scraped text is other people's content and may contain spoilers.

## Decision

Curated, verified data lives in `data/curated/*.yaml`, validated with zod, and is committed: it's the source of truth. Scrapers and the schema are public. Scraped extracts (with URL and fetch time) live only in the server database as candidates. A candidate is promoted to curated by hand review. The app renders curated items plus candidates flagged "needs research", never raw scraped text (superseded: since ADR 0008 the app renders curated items only, unflagged).

## Consequences

- Nothing scraped is ever committed; `.gitignore` covers local DB files.
- Every curated item cites sources.
- A candidate's display text is written or reviewed by hand before it shows.
