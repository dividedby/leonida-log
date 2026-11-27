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

## Note (2026-11-27): KeenGamer is read from its RSS feed

KeenGamer's article pages and `/rss` answer 403 with a Cloudflare challenge (`cf-mitigated: challenge`) from the server and from a home connection alike. The scrapers do not try to pass a challenge: no browser emulation, no header or TLS spoofing, no proxies or residential egress, which also keeps to "no headless browsers" above. The sitemaps are open, but the pages they list are not, and the Wayback fallback found captures for none of 74 pending pages.

`https://www.keengamer.com/feed/` is open, allowed by robots.txt and carries the full article HTML of its newest 20 items (about 9 hours). The `keengamer` source therefore stores the feed items tagged "Grand Theft Auto VI", using the feed's HTML as the page body, and fetches no article page. A 4-hourly systemd timer polls the feed alone (`pnpm scrape --feed-only`); the weekly scrape reads it too and uses the sitemaps for each item's lastmod. The Wayback fallback for KeenGamer is removed.

Consequences: KeenGamer coverage is what the feed shows at poll time (anything older than the newest 20 items is not seen, and robots.txt rules out paging and the REST API), and it is limited to articles tagged "Grand Theft Auto VI".
