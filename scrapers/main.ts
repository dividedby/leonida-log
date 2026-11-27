import { parseArgs } from "node:util";
import { loadCurated } from "../lib/curated-load";
import type { CuratedData } from "../lib/curated";
import { openDatabase, type OpenedDatabase } from "../lib/db/open";
import { createPoliteFetcher, type PoliteFetchDeps } from "./fetch/politeFetch";
import { DEFAULT_REPORT_DIR, renderReport, writeReport } from "./report";
import { runScrape, selectSources } from "./run";
import { SOURCES } from "./sources";
import { candidatesSince, purgeSource } from "./store";
import type { SourceModule } from "./types";
import { captures, rawCaptureUrl } from "./wayback";

const USAGE = `Usage: pnpm scrape [--source x[,y]] [--since YYYY-MM-DD] [--report-only] [--dry-run] [--github-search]
       pnpm scrape --feed-only [--dry-run]
       pnpm scrape --purge <source>
       pnpm scrape --wayback <url[*]> [--since YYYY-MM-DD]

  --source       run only these (enabled) sources
  --since        fetch/report lower bound; default is 14 days on a source's first run, 7 days for the report
  --report-only  regenerate the changed-since report from the database, no fetching
  --dry-run      fetch and diff but write nothing (no database rows, no report)
  --github-search  run the github source's repo search now (it otherwise runs once a week)
  --feed-only    poll only the sources that have a feed (keengamer), one request each; writes no report
  --purge        delete a source's tracked pages and candidates (also for ids no longer in the registry); nothing else runs
  --wayback      list Wayback captures of a URL (trailing * means prefix); no database writes

Environment: DATABASE_PATH (required), SCRAPERS_DISABLED (comma list of source ids), SCRAPE_REPORT_DIR`;

const DAY_MS = 86_400_000;
/**
 * A feed poll ends by itself: every fetch and wait aborts at the deadline and the run exits 2. It must stay
 * well under the feed unit's TimeoutStartSec (deploy/leonida-log-feed.service), which counts the lock wait and
 * the container start on top.
 */
export const FEED_DEADLINE_MS = 180_000;
const FEED_RETRY_BUDGET = 2;

export interface CliDeps {
  modules?: SourceModule[];
  curated?: CuratedData;
  fetchDeps?: PoliteFetchDeps;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Scrapers never migrate; same check as lib/db/client.ts (which is server-only). */
function schemaReady(
  opened: OpenedDatabase,
  file: string,
  log: (message: string) => void,
): boolean {
  const columns = opened.sqlite
    .prepare("SELECT name FROM pragma_table_info('sources')")
    .all() as { name: string }[];
  if (columns.some((c) => c.name === "content_hash")) return true;
  log(`Database at ${file} has no current schema; run pnpm db:migrate first`);
  return false;
}

/** Returns the exit code: 0 ok, 1 usage or setup error, 2 a source's listing couldn't be read. */
export async function runCli(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: CliDeps = {},
): Promise<number> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const now = deps.now ?? (() => new Date());

  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        source: { type: "string" },
        since: { type: "string" },
        "report-only": { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        "github-search": { type: "boolean", default: false },
        "feed-only": { type: "boolean", default: false },
        wayback: { type: "string" },
        purge: { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
    }));
  } catch (error) {
    log(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }
  if (values.help) {
    log(USAGE);
    return 0;
  }
  if (values["feed-only"] && (values["report-only"] || values.since)) {
    log(`--feed-only can't be combined with --report-only or --since`);
    return 1;
  }
  if (values.since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values.since)) {
    log(`--since must be YYYY-MM-DD, got "${values.since}"`);
    return 1;
  }

  const fetcher = createPoliteFetcher({
    log,
    ...(values["feed-only"]
      ? { deadlineMs: FEED_DEADLINE_MS, retryBudget: FEED_RETRY_BUDGET }
      : {}),
    ...deps.fetchDeps,
  });

  if (values.wayback !== undefined) {
    const prefix = values.wayback.endsWith("*");
    const url = prefix ? values.wayback.slice(0, -1) : values.wayback;
    try {
      const found = await captures(fetcher.forSource().get, url, {
        from: values.since?.replaceAll("-", ""),
        matchType: prefix ? "prefix" : undefined,
      });
      for (const c of found) {
        log(
          `${c.timestamp} ${c.original} ${rawCaptureUrl(c.timestamp, c.original)}`,
        );
      }
      log(`${found.length} capture(s)`);
      return 0;
    } catch (error) {
      log(`wayback: ${(error as Error).message}`);
      return 1;
    }
  }

  const file = env.DATABASE_PATH;
  if (!file) {
    log("DATABASE_PATH is not set");
    return 1;
  }

  if (values.purge !== undefined) {
    const id = values.purge.trim().toLowerCase();
    if (!id) {
      log("--purge needs a source id");
      return 1;
    }
    const target = openDatabase(file);
    try {
      if (!schemaReady(target, file, log)) return 1;
      const { pages, candidates } = purgeSource(target.db, id);
      log(`purged ${id}: ${pages} page(s), ${candidates} candidate(s) deleted`);
      return 0;
    } finally {
      target.close();
    }
  }

  const feedOnly = values["feed-only"];
  let modules: SourceModule[] = [];
  if (!values["report-only"]) {
    try {
      modules = selectSources(
        deps.modules ?? SOURCES,
        values.source?.split(","),
        env.SCRAPERS_DISABLED,
      );
    } catch (error) {
      log((error as Error).message);
      return 1;
    }
    if (feedOnly) {
      modules = modules.filter((m) => m.hasFeed);
      if (modules.length === 0) {
        log("--feed-only: no enabled source has a feed");
        return 1;
      }
    }
  }

  let curated: CuratedData;
  try {
    curated = deps.curated ?? loadCurated();
  } catch (error) {
    log(`Could not load curated data: ${(error as Error).message}`);
    return 1;
  }

  const opened = openDatabase(file);
  try {
    if (!schemaReady(opened, file, log)) return 1;

    const reportSince =
      values.since ??
      new Date(now().getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
    const dryRun = values["dry-run"];
    let stats;
    let code = 0;

    if (!values["report-only"]) {
      stats = await runScrape({
        db: opened.db,
        curated,
        modules,
        fetcher,
        since: values.since,
        dryRun,
        feedOnly,
        forceDiscovery: values["github-search"] ? ["github"] : [],
        now,
        log,
      });
      if (stats.some((s) => s.discoveryError)) code = 2;
    }
    if (dryRun) {
      log("dry run: nothing written");
      return code;
    }
    // The weekly run owns the report; a feed poll only stores candidates for it.
    if (feedOnly) return code;

    const markdown = renderReport({
      rows: candidatesSince(opened.db, new Date(`${reportSince}T00:00:00Z`)),
      curated,
      since: reportSince,
      generatedAt: now(),
      stats,
      notes: Object.fromEntries(
        (deps.modules ?? SOURCES).flatMap((m) =>
          m.reportNote ? [[m.id, m.reportNote]] : [],
        ),
      ),
    });
    const dir = env.SCRAPE_REPORT_DIR || DEFAULT_REPORT_DIR;
    log(`report written to ${writeReport(dir, reportSince, markdown)}`);
    return code;
  } finally {
    opened.close();
  }
}
