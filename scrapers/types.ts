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
  method: "wp-rest" | "sitemap" | "html-index";
  /** Cheap listing. Throws when the listing can't be read. */
  discover(ctx: SourceContext): Promise<PageRef[]>;
  /** Defaults to the generic main-content extractor. */
  extract?(html: string, url: string): Extract;
}

export const DEFAULT_MAX_PAGES_PER_RUN = 40;
