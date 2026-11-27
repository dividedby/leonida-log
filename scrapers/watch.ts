import type { Db } from "../lib/db/open";
import type { Hints } from "./hints";
import type { SourceStats } from "./run";
import {
  insertCandidate,
  insertPage,
  updatePage,
  type TrackedPage,
} from "./store";
import type {
  SourceContext,
  SourceModule,
  StoredPage,
  WatchItem,
} from "./types";
import { RAW_EXTRACT_MAX, truncate } from "./util";

export interface RunWatchOptions {
  db: Db;
  mod: SourceModule;
  stats: SourceStats;
  ctx: SourceContext;
  tracked: Map<string, TrackedPage>;
  hinter: (title: string, text: string) => Hints;
  now: Date;
  dryRun?: boolean;
  forceDiscovery: boolean;
}

/** Runs a module's `watch` and stores what it returns: rows, and candidates for the items that carry one. */
export async function runWatch(opts: RunWatchOptions): Promise<void> {
  const { mod, stats, tracked, now } = opts;
  const log = opts.ctx.log;
  const stored = new Map<string, StoredPage>(
    [...tracked].map(([url, r]) => [
      url,
      {
        etag: r.etag,
        remoteModified: r.remoteModified,
        contentHash: r.contentHash,
        checkedAt: r.checkedAt,
      },
    ]),
  );

  let result;
  try {
    result = await mod.watch!({
      ...opts.ctx,
      stored,
      now,
      forceDiscovery: opts.forceDiscovery,
    });
  } catch (error) {
    stats.discoveryError =
      error instanceof Error ? error.message : String(error);
    stats.errors++;
    log(`[${mod.id}] watch failed: ${stats.discoveryError}`);
    return;
  }
  Object.assign(stats, result.stats);

  for (const item of result.items) {
    const row = tracked.get(item.url);
    if (item.candidate) {
      if (item.candidate.changeKind === "modified") stats.changed++;
      else stats.new++;
      if (opts.dryRun) {
        log(`[${mod.id}] would emit ${item.candidate.changeKind}: ${item.url}`);
        continue;
      }
    } else if (opts.dryRun) continue;
    store(opts, item, row);
  }
}

function store(
  opts: RunWatchOptions,
  item: WatchItem,
  row: TrackedPage | undefined,
): void {
  const { mod, now } = opts;
  const c = item.candidate;
  opts.db.transaction((tx) => {
    const patch = {
      title: item.title,
      remoteModified: item.remoteModified,
      etag: item.etag,
      httpStatus: 200,
      checkedAt: now,
      ...(c
        ? {
            fetchedAt: now,
            changedAt: now,
            contentHash: item.contentHash,
            extract: item.extract,
          }
        : {}),
    };
    let rowId: number;
    if (row) {
      updatePage(tx, row.id, patch);
      rowId = row.id;
    } else {
      rowId = insertPage(tx, {
        source: mod.id,
        url: item.url,
        host: new URL(item.url).host,
        fetchedAt: now,
        ...patch,
      });
    }
    if (!c) return;
    const hints = opts.hinter(item.title, c.hintText);
    insertCandidate(tx, {
      sourceRowId: rowId,
      gateHint: hints.gateHint,
      categoryHint: c.categoryHint,
      missionHint: hints.missionSlugs.length
        ? hints.missionSlugs.join(",")
        : null,
      changeKind: c.changeKind,
      contentHash: item.contentHash ?? "",
      diffSummary: JSON.stringify(c.diffSummary),
      rawExtract: truncate(c.rawExtract, RAW_EXTRACT_MAX),
      createdAt: now,
    });
  });
}
