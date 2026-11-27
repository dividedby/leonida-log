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
| `--github-search`                | Run the `github` source's repo search now. It otherwise runs at most once every 7 days; `--since` does not force it.                                           |
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
| `github`    | GitHub REST API          | Datamine files in public repos, watched by last-commit sha, plus a weekly repo search. Not a page source: see [GitHub](#github). Tier B in `docs/sources.md`.                                                                                                                                                                                                                                                                    |

**Switching a source off:** set `enabled: false` in its module, or set `SCRAPERS_DISABLED=ign,keengamer` (comma list of ids) in the environment. `--source` picks among enabled sources only.

## GitHub

The `github` source (`sources/github.ts`) watches datamine files through the GitHub REST API only. `github.com` and `raw.githubusercontent.com` disallow `/*/raw/`, `/*/commits/` and `/*/tree/` for `*`, so they are never fetched; the `url` stored for a watched file (`https://github.com/<repo>/blob/HEAD/<path>`) is display only. `api.github.com/robots.txt` answers 404, which reads as allow-all. Requests go through the polite layer, 2 s apart, with `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`.

What it watches is in `scrapers/config/github.yaml` (validated with zod on load): `watch` (repo and file paths), `discovery` (query, `every_days`, `keywords`, `exclude_patterns`, `blocklist`) and `max_inline_bytes`. Adding a repo or a path needs no code change.

- **Change detection is by commit sha.** Each watched file is one tracked row. `GET /repos/{repo}/commits?path=...&per_page=1` is sent with the stored ETag; a 304 (not counted against the rate limit) or the same sha means nothing changed. `content_hash` is the sha and `remote_modified` the commit date.
- **First sighting** emits a `new` candidate: a header (repo, path, sha, date, message, the tier line) and, for a file at or under `max_inline_bytes`, its first 200 lines from `GET /repos/{repo}/contents/{path}?ref={sha}` with the raw media type. File sizes come from one directory listing per directory per run. A larger file (`ArchiveItems.txt` is 17 MB) is never fetched: header only.
- **A different sha** costs one `GET /repos/{repo}/compare/{old}...{new}` per repo and sha pair, shared by every path that moved with it, and emits a `modified` candidate: the commits in range (repo-wide), the file's `+`/`-` counts and the `+`/`-` rows of its patch. When GitHub omits the patch for a large diff, only the counts are given; if the old sha no longer exists, the latest commit alone.
- **Candidates** carry `category_hint` `datamine` and the line `Tier B — datamine: IDs real, labels community guesses`; the report prints that line under the `github` heading. Mission hints come from the added rows and commit messages (titles rarely appear there).
- **Rate budget.** The unauthenticated limit is 60 requests an hour per IP. Every response's `x-ratelimit-remaining` is read; below 5 the run stops calling GitHub, logs how many requests it deferred, and the next run picks them up. A 403 or 429 with `x-ratelimit-remaining: 0` is rate limiting, not a block: the run logs the reset time and stops, and the next run tries again. A first run costs about 27 requests; later runs about one per watched file, mostly 304s.
- **Discovery** runs at most once every `every_days` (tracked by the `https://api.github.com/search/repositories#gta6-datamines` row's `checked_at`; `--github-search` forces it). It searches repositories pushed since the last search (30 days back the first time) and keeps those whose name, description or topics contain a keyword and match no exclude pattern, dropping forks, repos already watched and blocklisted repos. Each repo not seen before becomes a `new` candidate with category `datamine-discovery` and the line "Review only: not watched. Add to scrapers/config/github.yaml after review." Nothing found this way is ever watched automatically; seen repos are not reported again.
- **Blocklist.** `discovery.blocklist` holds repos that look like malware lures (for example a "PC port" with a LAN tool and a download). A blocklisted repo is never reported, and listing one under `watch` fails config validation.
- Releases, archives (zipball, tarball) and `download_url`s are never requested.

## Environment

| Variable            | Use                                                            |
| ------------------- | -------------------------------------------------------------- |
| `DATABASE_PATH`     | SQLite file. Required, except for `--wayback`.                 |
| `SCRAPERS_DISABLED` | Comma list of source ids to skip.                              |
| `SCRAPE_REPORT_DIR` | Report directory. Default `data/scraped/reports` (gitignored). |

## Politeness rules

- User-Agent `LeonidaLogBot/0.1 (+https://github.com/dividedby/leonida-log)`. It never imitates a browser and never contains `Claude`, `Code` or `Cursor` (a test enforces it).
- robots.txt (RFC 9309): fetched once per host per run; group chosen by the `leonidalogbot` token, else `*`; longest match wins, Allow wins ties; 4xx other than 429 means allow all; 429, 5xx or a network error (after retries) means disallow all for that host this run; Disallowed URLs are skipped and counted. Every redirect hop's host is checked too.
- One request at a time per host, at least 5 s apart (a source's `minIntervalMs`, or the robots `Crawl-delay` capped at 60 s, whichever is larger). Sources run one after another.
- Conditional GET, 30 s timeout, 5 MB body cap, at most 5 redirects.
- Retries: a timeout, network error, 429 or 5xx (robots.txt included) is retried up to 2 times, waiting `Retry-After` or else 10 s, then 20 s; the host interval still applies. A `Retry-After` over 60 s is not waited out: the request gives up. 4xx other than 429, robots blocks, the body cap and the redirect limit are never retried. A run has 8 retries in all, shared by every source, so retries add at most 12 minutes to a run (each at most 60 s of waiting plus a 30 s request). The first server run took about 23 minutes; the unit's `TimeoutStartSec` is 45. Only the final attempt's outcome counts below.
- 429 or 503 still failing after its retries stops that host for the run. 403 stops the host for the run, and so do 3 consecutive URLs that fail after their retries (5xx, timeout or network error; any other response resets the count). Other 4xx are recorded on the URL.
- A listing (sitemap index or child sitemap) that still fails after its retries fails that source's discovery, and the run exits 2. A source is not marked partial: without `--since`, KeenGamer reads only its newest child sitemaps, so a skipped child could drop out of next week's window and its changes would be lost without an alert.
- No headless browsers and no JavaScript execution: pages that need it yield an empty extract, which is logged and left untouched.

## The weekly research pass

Each run writes `changed-since-<YYYY-MM-DD>.md` and `latest.md` to the report directory (`--since`, default 7 days back). It opens with per-source counts (discovered, fetched, unchanged, changed, new, baselined, deferred, robots-blocked, errors), then lists changed pages grouped by gate hint (story order, then "No gate hint") and source: title, URL, change kind, remote modified, mission hints with order numbers, headings added or removed, paragraph counts and up to three short snippets. Read it, open the sources worth a look, and promote facts into `data/curated/` by hand with a source link. The file holds scraped snippets: it stays on the server and is never committed.

## On the server

A systemd timer on the VPS runs the scrapers every Monday at 06:15 America/Chicago (`deploy/leonida-log-scrape.timer`; the owner enables it with `install-host.sh --enable-scrape`, see [../deploy/README.md](../deploy/README.md)). It starts `docker compose run --rm scraper` from the deployed image, with `DATABASE_PATH=/data/leonida.db` and `SCRAPE_REPORT_DIR=/data/reports`, which are `/var/lib/leonida-log/leonida.db` and `/var/lib/leonida-log/reports/` on the host. The container is capped at 256 MB. A run holds the deploy lock, so a deploy that starts during a scrape waits (and fails after 10 minutes; re-run it). Read the report at `/var/lib/leonida-log/reports/latest.md`.

Exit 0 is a clean run. Any other status (1 bad setup, 2 a source's listing could not be read) fails the unit and sends one alert to Discord #attention through `OnFailure=host-alert@attention:`. To switch a source off on the server without a deploy, set `SCRAPERS_DISABLED=ign,keengamer` in `/etc/leonida-log/compose.env`. Run one by hand with `systemctl start leonida-log-scrape.service` and `journalctl -u leonida-log-scrape`. The unauthenticated GitHub budget (60 requests an hour) is per IP and shared with everything else on the host.

## Purging a source

`pnpm scrape --purge <source>` deletes the source's `sources` rows and its candidates, then exits without scraping.

- **A site objects (ADR 0007):** remove the module from `sources/index.ts` (or set `enabled: false`), then purge it. The id doesn't need to be in the registry.
- **An extractor or selector change:** stored hashes belong to the old extraction, so every page would look changed or stale. Purge the source, then run it again to re-extract from scratch; the first run re-applies the 14-day default (or pass `--since`).

## Adding a source

1. Create `sources/<id>.ts` exporting a `SourceModule` (`types.ts`): `id`, `name`, `enabled`, `hosts`, optional `minIntervalMs` and `maxPagesPerRun`, `method`, and `discover(ctx)` returning `PageRef[]`. Optional `fallback(ctx, pending)`: called once if the host is stopped mid-run, with the pages deferred by the stop; return replacement refs (e.g. Wayback captures with `fetchUrl`). Fetch only through `ctx.fetch` (the polite layer); throw if the listing can't be read. Add an `extract` built with `extractorFor([...selectors])` when the generic main-content pick isn't right.
2. Register it in `sources/index.ts` (rank order).
3. Test `discover` against a hand-written fixture (`sources/sources.test.ts`). Fixtures are synthetic: never paste real guide text.
4. Add it to the table above and to the changelog.

A source that isn't a set of pages (an API where change is a commit sha) can define `watch(ctx)` instead: it makes its own change decision from `ctx.stored` (a read-only view of its rows), returns the rows to store and any candidates, and `run.ts` persists them (`watch.ts`). `discover` then returns `[]`. `github` is the only one.

## Tests

`pnpm test` runs everything with a fake network and a fake clock; no test touches a real site.
