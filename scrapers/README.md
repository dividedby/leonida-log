# Scrapers

Watches guide sites for new and changed pages and stores what it finds in the server database (ADR 0003, ADR 0007). Nothing it fetches is committed or rendered raw. Source list and reliability notes: [../docs/sources.md](../docs/sources.md).

```sh
DATABASE_PATH=data/local.db pnpm db:migrate     # scrapers never migrate
DATABASE_PATH=data/local.db pnpm scrape         # all enabled sources
```

| Flag                             | Meaning                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--source x[,y]`                 | Only these sources. Errors on an unknown or disabled id.                                                                                                       |
| `--since YYYY-MM-DD`             | Pages last modified before this are recorded as baselines without fetching. Also the report's start date.                                                      |
| `--report-only`                  | Rebuild the report from the database; no fetching.                                                                                                             |
| `--dry-run`                      | Fetch and diff, write no rows and no report.                                                                                                                   |
| `--purge <source>`               | Delete every tracked page of that source id and, by cascade, its candidates. Prints the counts and does nothing else. Works for ids no longer in the registry. |
| `--wayback <url[*]> [--since D]` | Print Wayback captures (a trailing `*` means prefix). No database writes.                                                                                      |

Exit codes: 0 done, 1 bad arguments or setup (missing `DATABASE_PATH`, unmigrated database), 2 a source's listing couldn't be read.

## How a run works

For each enabled source, in rank order (`sources/index.ts`):

1. **Discover.** The module lists pages cheaply (WP REST, a sitemap, or an HTML index), each with a remote modified time when the source has one.
2. **Decide**, per page, against the `sources` table:
   - Not seen before: fetch it and emit a `new` candidate. If `--since` is set (or it is the source's first run, which defaults to 14 days back) and the page is older, store a baseline row and fetch nothing.
   - Seen, and the listing's modified time is not later than the stored one: skip without fetching.
   - Otherwise fetch with the stored `ETag` / `Last-Modified`. A 304 or an identical content hash only updates `checked_at`; a different hash stores the new extract and emits a `modified` candidate with a diff summary.
3. **Cap.** At most `maxPagesPerRun` network fetches per source (default 40), newest remote modified first, then least recently checked. The rest are deferred; their stored modified time does not advance, so the next run picks them up.
4. **Extract.** `extract.ts` keeps headings, paragraphs, list items and table cells of the main content, drops chrome, scripts and "Updated ..." / view-count lines, and hashes the normalized text so dynamic noise doesn't flip it.
5. **Hints.** `hints.ts` matches curated mission titles (case-insensitive, word boundaries, 5+ characters) in the page and sets `mission_hint` (slugs) and `gate_hint` (the first gate at or after the latest main mission named).

A `candidates` row holds the change kind, hints, content hash, a JSON diff summary (headings added/removed, paragraph counts, up to three short snippets) and `raw_extract` (the normalized text, at most 50,000 characters). Review and promotion stay manual.

## Sources

| id          | Method                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `powerpyx`  | WP REST, category 258221 | Content comes with the listing, so no per-page fetch. `modified_after` from `--since`.                                                                                                                                                                                                                                                                                                                                           |
| `gtabase`   | sitemap index            | Index lastmod is regenerated daily, so every English child is read and per-URL lastmod compared.                                                                                                                                                                                                                                                                                                                                 |
| `ign`       | sitemap                  | About 1,000 wiki URLs, 40 fetches per run. IGN's terms ban automated retrieval; the owner chose breadth (ADR 0007). Remove the module and purge its candidates if IGN objects.                                                                                                                                                                                                                                                   |
| `keengamer` | sitemap index            | robots.txt disallows `/wp-json/` and `?` URLs, so only sitemap pages are used. If the sitemap answers 403, discovery falls back to Wayback captures (rows stay keyed by the live URL, modified time from the capture). If the host is stopped mid-run (403, or 3 consecutive 5xx), the pending pages go through one CDX prefix query and each takes its newest capture at least as new as its lastmod, within the same page cap. |
| `game8jp`   | gzipped sitemap          | Redirects to an S3 host; its robots.txt answers 4xx, which counts as allow. Only `https://game8.jp/gta6/<digits>`. Pages carry JSON-LD `dateModified`.                                                                                                                                                                                                                                                                           |
| `gamewith`  | sitemap                  | Only `https://gamewith.jp/gta6/<digits>`.                                                                                                                                                                                                                                                                                                                                                                                        |
| `vandal`    | HTML index               | No lastmod: change detection by hash. The hub is tracked as a page; 20 chapters per run, least recently checked first. ISO-8859-1 decoded by Content-Type.                                                                                                                                                                                                                                                                       |

**Switching a source off:** set `enabled: false` in its module, or set `SCRAPERS_DISABLED=ign,keengamer` (comma list of ids) in the environment. `--source` picks among enabled sources only.

## Environment

| Variable            | Use                                                            |
| ------------------- | -------------------------------------------------------------- |
| `DATABASE_PATH`     | SQLite file. Required, except for `--wayback`.                 |
| `SCRAPERS_DISABLED` | Comma list of source ids to skip.                              |
| `SCRAPE_REPORT_DIR` | Report directory. Default `data/scraped/reports` (gitignored). |

## Politeness rules

- User-Agent `LeonidaLogBot/0.1 (+https://github.com/dividedby/leonida-log)`. It never imitates a browser and never contains `Claude`, `Code` or `Cursor` (a test enforces it).
- robots.txt (RFC 9309): fetched once per host per run; group chosen by the `leonidalogbot` token, else `*`; longest match wins, Allow wins ties; 4xx means allow all, 5xx or a network error means disallow all for that host this run; Disallowed URLs are skipped and counted. Every redirect hop's host is checked too.
- One request at a time per host, at least 5 s apart (a source's `minIntervalMs`, or the robots `Crawl-delay` capped at 60 s, whichever is larger). Sources run one after another.
- Conditional GET, 30 s timeout, 5 MB body cap, at most 5 redirects.
- 429 or 503: wait `Retry-After` (at most 120 s) once, then stop that host for the run; the first 429 or 503 only counts toward the 5xx streak once its retry also fails. 403 stops the host for the run, and so do 3 consecutive 5xx responses from it (any other response resets the count). Other 4xx are recorded on the URL.
- No headless browsers and no JavaScript execution: pages that need it yield an empty extract, which is logged and left untouched.

## The weekly research pass

Each run writes `changed-since-<YYYY-MM-DD>.md` and `latest.md` to the report directory (`--since`, default 7 days back). It opens with per-source counts (discovered, fetched, unchanged, changed, new, baselined, deferred, robots-blocked, errors), then lists changed pages grouped by gate hint (story order, then "No gate hint") and source: title, URL, change kind, remote modified, mission hints with order numbers, headings added or removed, paragraph counts and up to three short snippets. Read it, open the sources worth a look, and promote facts into `data/curated/` by hand with a source link. The file holds scraped snippets: it stays on the server and is never committed.

## Purging a source

`pnpm scrape --purge <source>` deletes the source's `sources` rows and its candidates, then exits without scraping.

- **A site objects (ADR 0007):** remove the module from `sources/index.ts` (or set `enabled: false`), then purge it. The id doesn't need to be in the registry.
- **An extractor or selector change:** stored hashes belong to the old extraction, so every page would look changed or stale. Purge the source, then run it again to re-extract from scratch; the first run re-applies the 14-day default (or pass `--since`).

## Adding a source

1. Create `sources/<id>.ts` exporting a `SourceModule` (`types.ts`): `id`, `name`, `enabled`, `hosts`, optional `minIntervalMs` and `maxPagesPerRun`, `method`, and `discover(ctx)` returning `PageRef[]`. Optional `fallback(ctx, pending)`: called once if the host is stopped mid-run, with the pages deferred by the stop; return replacement refs (e.g. Wayback captures with `fetchUrl`). Fetch only through `ctx.fetch` (the polite layer); throw if the listing can't be read. Add an `extract` built with `extractorFor([...selectors])` when the generic main-content pick isn't right.
2. Register it in `sources/index.ts` (rank order).
3. Test `discover` against a hand-written fixture (`sources/sources.test.ts`). Fixtures are synthetic: never paste real guide text.
4. Add it to the table above and to the changelog.

## Tests

`pnpm test` runs everything with a fake network and a fake clock; no test touches a real site.
