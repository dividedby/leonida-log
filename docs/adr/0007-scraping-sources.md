# 7. Scraping: any source, politely

Date: 2026-11-25
Status: Accepted

## Context

Guides disagree and update daily during launch. Some sites' terms forbid scraping; the owner chose breadth over a per-site terms allowlist.

## Decision

Scrapers may fetch any site or source. They still respect robots.txt, use polite per-host rate limits and a descriptive generic User-Agent, cache responses, and run without headless browsers so they stay light on the VPS. Scraped data stays private on the server (ADR 0003) and every promoted fact keeps its source link.

## Consequences

- Each source is a module in `scrapers/sources/` and can be switched off on its own.
- If a site objects, remove its source module and purge its candidates.
