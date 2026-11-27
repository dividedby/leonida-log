import type { ChangeKind } from "../lib/db/schema";
import type { SourceFetch } from "./fetch/politeFetch";

/** A page a source's listing points at. */
export interface PageRef {
  /** Canonical URL; the key change detection tracks. */
  url: string;
  /** ISO UTC from the listing (WP modified_gmt, sitemap lastmod). */
  remoteModified?: string;
  title?: string;
  /** HTML the listing already returned (WP REST content.rendered); skips the page fetch. */
  body?: string;
  /** Fetch this instead of `url` (Wayback raw captures). Conditional headers aren't sent. */
  fetchUrl?: string;
}

export interface Extract {
  title: string;
  /**
   * Normalized lines: headings as `# `..`#### `, list items as `- `, other
   * blocks plain. diff.ts reads the markers back.
   */
  text: string;
  headings: string[];
  /** sha256 of `text`. */
  hash: string;
  /** JSON-LD dateModified, when the page carries one. */
  remoteModified?: string;
}

export interface SourceContext {
  /** Polite fetch bound to this source's per-host interval. Discovery must use it. */
  fetch: SourceFetch;
  /** ISO date or datetime; undefined means no lower bound. */
  since?: string;
  log(message: string): void;
}

/** Read-only view of a stored `sources` row, for modules that decide change themselves. */
export interface StoredPage {
  etag: string | null;
  remoteModified: string | null;
  contentHash: string | null;
  checkedAt: Date | null;
}

export interface WatchContext extends SourceContext {
  /** Rows this source already tracks, by URL. */
  stored: ReadonlyMap<string, StoredPage>;
  now: Date;
  /** The operator asked for the module's optional discovery pass this run. */
  forceDiscovery: boolean;
}

export interface WatchCandidate {
  changeKind: ChangeKind;
  categoryHint: string;
  /** Stored as `raw_extract` (truncated to 50,000 characters). */
  rawExtract: string;
  /** What the mission-hint matcher reads. */
  hintText: string;
  /** Shown by the report: `lines` as bullets, `snippets` as quotes. */
  diffSummary: { lines?: string[]; snippets?: string[] };
}

/** One tracked row a watch run wants stored. Without a candidate it only records the check. */
export interface WatchItem {
  url: string;
  title: string;
  remoteModified?: string;
  etag?: string | null;
  contentHash?: string;
  /** Kept to compare next time; never large. */
  extract?: string;
  candidate?: WatchCandidate;
}

export interface WatchResult {
  items: WatchItem[];
  /** Counters for the run summary; `new` and `changed` come from the candidates. */
  stats: {
    discovered: number;
    fetched: number;
    unchanged: number;
    deferred: number;
    errors: number;
  };
}

export interface SourceModule {
  /** Lowercase id, e.g. "powerpyx"; the `sources.source` value. */
  id: string;
  name: string;
  /** Module-level switch; env SCRAPERS_DISABLED overrides at runtime. */
  enabled: boolean;
  hosts: string[];
  /** Per-host minimum gap in ms. Default 5000. */
  minIntervalMs?: number;
  /** Network page fetches per run. Default 40. */
  maxPagesPerRun?: number;
  method: "wp-rest" | "sitemap" | "html-index" | "github-api";
  /** Report note printed under the source heading (e.g. a reliability tier). */
  reportNote?: string;
  /** Cheap listing. Throws when the listing can't be read. Unused (return []) when `watch` is set. */
  discover(ctx: SourceContext): Promise<PageRef[]>;
  /**
   * Replaces discover + fetch for sources that aren't pages (an API where
   * change is a commit sha). The module makes its own change decision from
   * `ctx.stored` and returns the rows to store; run.ts persists them and
   * emits the candidates. Throws when nothing could be read.
   */
  watch?(ctx: WatchContext): Promise<WatchResult>;
  /**
   * Called once when the host stopped mid-run (403, repeated 5xx) with the
   * refs left unfetched. Returns refs reachable another way (e.g. Wayback
   * captures via `fetchUrl`); the run processes them under the same page cap.
   */
  fallback?(ctx: SourceContext, pending: PageRef[]): Promise<PageRef[]>;
  /** Defaults to the generic main-content extractor. */
  extract?(html: string, url: string): Extract;
}

export const DEFAULT_MAX_PAGES_PER_RUN = 40;
