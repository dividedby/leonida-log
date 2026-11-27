import type { CuratedData } from "../lib/curated";
import type { Db } from "../lib/db/open";
import { diffExtracts } from "./diff";
import { extractHtml } from "./extract";
import type { FetchResult, PoliteFetcher } from "./fetch/politeFetch";
import { createHinter } from "./hints";
import {
  insertCandidate,
  insertPage,
  loadExtract,
  loadTracked,
  updatePage,
  type TrackedPage,
} from "./store";
import {
  DEFAULT_MAX_PAGES_PER_RUN,
  type PageRef,
  type SourceModule,
} from "./types";
import { isLater, toIso, truncate } from "./util";

const FIRST_RUN_DAYS = 14;
const RAW_EXTRACT_MAX = 50_000;
const DAY_MS = 86_400_000;

export interface SourceStats {
  id: string;
  name: string;
  discovered: number;
  fetched: number;
  /** Not re-fetched, 304, or same content hash. */
  unchanged: number;
  changed: number;
  new: number;
  /** Recorded without a fetch because older than --since. */
  baselined: number;
  /** Left for the next run: over maxPagesPerRun, or the host stopped. */
  deferred: number;
  blockedByRobots: number;
  errors: number;
  /** Set when the listing itself couldn't be read. */
  discoveryError: string | null;
}

export interface RunOptions {
  db: Db;
  curated: CuratedData;
  modules: SourceModule[];
  fetcher: PoliteFetcher;
  /** YYYY-MM-DD or ISO. Absent: 14 days on a source's first run, otherwise no bound. */
  since?: string;
  dryRun?: boolean;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Applies --source and the disabled switches; throws a clear message on an unknown or disabled id. */
export function selectSources(
  all: SourceModule[],
  requested: string[] | undefined,
  disabledEnv: string | undefined,
): SourceModule[] {
  const envDisabled = new Set(
    (disabledEnv ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const isEnabled = (m: SourceModule) => m.enabled && !envDisabled.has(m.id);
  if (!requested || requested.length === 0) return all.filter(isEnabled);

  const picked = new Set(requested.map((r) => r.trim().toLowerCase()));
  for (const id of picked) {
    const mod = all.find((m) => m.id === id);
    if (!mod) {
      throw new Error(
        `Unknown source "${id}". Known: ${all.map((m) => m.id).join(", ")}`,
      );
    }
    if (!isEnabled(mod)) {
      throw new Error(
        `Source "${id}" is disabled (module switch or SCRAPERS_DISABLED)`,
      );
    }
  }
  return all.filter((m) => picked.has(m.id));
}

function emptyStats(mod: SourceModule): SourceStats {
  return {
    id: mod.id,
    name: mod.name,
    discovered: 0,
    fetched: 0,
    unchanged: 0,
    changed: 0,
    new: 0,
    baselined: 0,
    deferred: 0,
    blockedByRobots: 0,
    errors: 0,
    discoveryError: null,
  };
}

function dedupe(refs: PageRef[]): PageRef[] {
  const byUrl = new Map<string, PageRef>();
  for (const ref of refs) {
    const prev = byUrl.get(ref.url);
    if (
      !prev ||
      (ref.remoteModified &&
        (!prev.remoteModified ||
          isLater(ref.remoteModified, prev.remoteModified)))
    ) {
      byUrl.set(ref.url, ref);
    }
  }
  return [...byUrl.values()];
}

/** Newest remote_modified first; ties and unknowns by least recently checked. */
function priority(a: Queued, b: Queued): number {
  const ra = a.ref.remoteModified
    ? Date.parse(a.ref.remoteModified)
    : -Infinity;
  const rb = b.ref.remoteModified
    ? Date.parse(b.ref.remoteModified)
    : -Infinity;
  if (ra !== rb) return rb > ra ? 1 : -1;
  return (
    (a.row?.checkedAt?.getTime() ?? 0) - (b.row?.checkedAt?.getTime() ?? 0)
  );
}

interface Queued {
  ref: PageRef;
  row?: TrackedPage;
}

/** 404 and similar are answers about this URL; 403, 408, 429 and 5xx are about the moment. */
function isDefinitive(status: number): boolean {
  return status >= 400 && status < 500 && ![403, 408, 429].includes(status);
}

export async function runScrape(opts: RunOptions): Promise<SourceStats[]> {
  const { db, modules, fetcher } = opts;
  const clock = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const hinter = createHinter(opts.curated);
  const all: SourceStats[] = [];

  for (const mod of modules) {
    const stats = emptyStats(mod);
    all.push(stats);
    const { get, stats: fetchStats } = fetcher.forSource(mod.minIntervalMs);
    const tracked = loadTracked(db, mod.id);

    const since =
      opts.since ??
      (tracked.size === 0
        ? new Date(clock().getTime() - FIRST_RUN_DAYS * DAY_MS).toISOString()
        : undefined);
    const sinceIso = toIso(since);
    log(`[${mod.id}] discovering${since ? ` (since ${since})` : ""}`);

    let refs: PageRef[];
    try {
      refs = dedupe(await mod.discover({ fetch: get, since, log }));
    } catch (error) {
      stats.discoveryError =
        error instanceof Error ? error.message : String(error);
      stats.errors++;
      stats.blockedByRobots = fetchStats.robotsBlocked;
      log(`[${mod.id}] discovery failed: ${stats.discoveryError}`);
      continue;
    }
    stats.discovered = refs.length;

    const queue: Queued[] = [];
    for (const ref of refs) {
      const row = tracked.get(ref.url);
      if (!row) {
        if (
          sinceIso &&
          ref.remoteModified &&
          isLater(sinceIso, ref.remoteModified)
        ) {
          if (!opts.dryRun) {
            insertPage(db, {
              source: mod.id,
              url: ref.url,
              host: new URL(ref.url).host,
              title: ref.title,
              remoteModified: ref.remoteModified,
              checkedAt: clock(),
            });
          }
          stats.baselined++;
        } else {
          queue.push({ ref });
        }
      } else if (
        ref.remoteModified &&
        row.remoteModified &&
        !isLater(ref.remoteModified, row.remoteModified)
      ) {
        stats.unchanged++;
      } else {
        queue.push({ ref, row });
      }
    }
    queue.sort(priority);

    const maxPages = mod.maxPagesPerRun ?? DEFAULT_MAX_PAGES_PER_RUN;
    const extract = mod.extract ?? extractHtml;
    let fetches = 0;

    for (let i = 0; i < queue.length; i++) {
      const { ref, row } = queue[i];
      const now = clock();
      let html = ref.body;
      let res: FetchResult | undefined;

      if (html === undefined) {
        if (fetches >= maxPages) {
          stats.deferred++;
          continue;
        }
        const conditional = row?.contentHash && !ref.fetchUrl;
        res = await get(
          ref.fetchUrl ?? ref.url,
          conditional
            ? {
                etag: row.etag ?? undefined,
                lastModified: row.lastModified ?? undefined,
              }
            : {},
        );
        if (res.outcome === "host-stopped") {
          stats.deferred += queue.length - i;
          log(
            `[${mod.id}] host stopped (${res.error}); deferring ${queue.length - i} pages`,
          );
          break;
        }
        if (res.outcome === "blocked-robots") continue;
        fetches++;
        stats.fetched++;

        if (res.outcome === "not-modified") {
          if (row && !opts.dryRun) {
            updatePage(db, row.id, {
              checkedAt: now,
              httpStatus: 304,
              remoteModified: ref.remoteModified,
            });
          }
          stats.unchanged++;
          continue;
        }
        if (res.outcome !== "ok") {
          stats.errors++;
          log(
            `[${mod.id}] ${ref.url}: ${res.outcome} ${res.status} ${res.error ?? ""}`,
          );
          if (!opts.dryRun) {
            const patch = {
              httpStatus: res.status || undefined,
              checkedAt: now,
              ...(isDefinitive(res.status)
                ? { remoteModified: ref.remoteModified }
                : {}),
            };
            if (row) updatePage(db, row.id, patch);
            else if (isDefinitive(res.status)) {
              insertPage(db, {
                source: mod.id,
                url: ref.url,
                host: new URL(ref.url).host,
                title: ref.title,
                ...patch,
              });
            }
          }
          continue;
        }
        html = res.text;
      }

      let ex;
      try {
        ex = extract(html, ref.url);
      } catch (error) {
        stats.errors++;
        log(`[${mod.id}] ${ref.url}: extract failed: ${String(error)}`);
        continue;
      }
      if (!ex.text) {
        stats.errors++;
        log(`[${mod.id}] ${ref.url}: empty extract, left untouched`);
        continue;
      }

      const title = ref.title || ex.title || null;
      const validators = ref.fetchUrl ? undefined : res;
      const common = {
        title,
        remoteModified:
          ref.remoteModified ??
          ex.remoteModified ??
          row?.remoteModified ??
          null,
        etag: validators ? (validators.headers.get("etag") ?? null) : undefined,
        lastModified: validators
          ? (validators.headers.get("last-modified") ?? null)
          : undefined,
        httpStatus: res?.status ?? 200,
        fetchedAt: now,
        checkedAt: now,
      };

      if (row?.contentHash === ex.hash) {
        if (!opts.dryRun) updatePage(db, row.id, common);
        stats.unchanged++;
        continue;
      }

      const hadContent = Boolean(row?.contentHash);
      const previous =
        hadContent && row ? (loadExtract(db, row.id) ?? "") : null;
      const diff = diffExtracts(previous, ex.text);
      const hints = hinter(title ?? "", ex.text);
      if (hadContent) stats.changed++;
      else stats.new++;
      if (opts.dryRun) {
        log(`[${mod.id}] would emit ${diff.kind}: ${ref.url}`);
        continue;
      }

      db.transaction((tx) => {
        const rowId = row
          ? (updatePage(tx, row.id, {
              ...common,
              contentHash: ex.hash,
              extract: ex.text,
              changedAt: now,
            }),
            row.id)
          : insertPage(tx, {
              source: mod.id,
              url: ref.url,
              host: new URL(ref.url).host,
              ...common,
              contentHash: ex.hash,
              extract: ex.text,
              changedAt: now,
            });
        insertCandidate(tx, {
          sourceRowId: rowId,
          gateHint: hints.gateHint,
          missionHint: hints.missionSlugs.length
            ? hints.missionSlugs.join(",")
            : null,
          changeKind: diff.kind,
          contentHash: ex.hash,
          diffSummary: JSON.stringify({
            headingsAdded: diff.headingsAdded,
            headingsRemoved: diff.headingsRemoved,
            paragraphsAdded: diff.paragraphsAdded,
            paragraphsRemoved: diff.paragraphsRemoved,
            snippets: diff.snippets,
          }),
          rawExtract: truncate(ex.text, RAW_EXTRACT_MAX),
          createdAt: now,
        });
      });
    }

    stats.blockedByRobots = fetchStats.robotsBlocked;
    log(
      `[${mod.id}] discovered ${stats.discovered}, fetched ${stats.fetched}, new ${stats.new}, changed ${stats.changed}, unchanged ${stats.unchanged}, baselined ${stats.baselined}, deferred ${stats.deferred}, robots-blocked ${stats.blockedByRobots}, errors ${stats.errors}`,
    );
  }
  return all;
}
