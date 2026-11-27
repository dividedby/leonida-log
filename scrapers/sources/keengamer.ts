import { extractorFor } from "../extract";
import { readSitemap } from "../sitemap";
import type { PageRef, SourceModule } from "../types";
import { captureIso, captures, rawCaptureUrl } from "../wayback";
import { isLater } from "../util";

// robots.txt disallows /wp-json/ and /*?, so only sitemap pages are used. The
// host has historically answered 403 to non-browser clients: when it does,
// discovery falls back to Wayback captures of the guide pages.
const INDEX = "https://www.keengamer.com/sitemap_index.xml";
const GUIDE_PREFIX = "https://www.keengamer.com/articles/guides/gta-6-";
const WAYBACK_PREFIX = "keengamer.com/articles/guides/gta-6-*";
const RECENT_CHILDREN_WITHOUT_SINCE = 3;

function blocked(error: unknown): boolean {
  return /\b(403|host-stopped)\b/.test(String(error));
}

/** `https://www.keengamer.com/<path>/` for a guide capture, else null. */
export function canonicalGuideUrl(original: string): string | null {
  let u: URL;
  try {
    u = new URL(original);
  } catch {
    return null;
  }
  const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
  const url = `https://www.keengamer.com${path}`;
  return url.startsWith(GUIDE_PREFIX) ? url : null;
}

async function viaWayback(
  ctx: Parameters<SourceModule["discover"]>[0],
): Promise<PageRef[]> {
  const from = (ctx.since ?? "").slice(0, 10).replaceAll("-", "") || undefined;
  const found = await captures(ctx.fetch, WAYBACK_PREFIX.replace(/\*$/, ""), {
    from,
    matchType: "prefix",
  });
  // Newest capture per page, keyed by the live sitemap's URL form: captures
  // can be http://, carry :80 or a query, which would duplicate live rows.
  const latest = new Map<string, string>();
  for (const c of found) {
    const url = canonicalGuideUrl(c.original);
    if (!url) continue;
    const prev = latest.get(url);
    if (!prev || c.timestamp > prev) latest.set(url, c.timestamp);
  }
  return [...latest].map(([url, timestamp]) => ({
    url,
    fetchUrl: rawCaptureUrl(timestamp, url),
    remoteModified: captureIso(timestamp),
  }));
}

export const keengamer: SourceModule = {
  id: "keengamer",
  name: "KeenGamer",
  enabled: true,
  hosts: ["www.keengamer.com"],
  method: "sitemap",
  async discover(ctx) {
    let index;
    try {
      index = await readSitemap(ctx.fetch, INDEX);
    } catch (error) {
      if (!blocked(error)) throw error;
      ctx.log("KeenGamer blocked: listing Wayback captures instead");
      return viaWayback(ctx);
    }

    let children = index.entries.filter((e) =>
      /post-sitemap\d*\.xml/.test(e.loc),
    );
    const since = ctx.since;
    if (since) {
      children = children.filter(
        (e) => !e.lastmod || !isLater(since, e.lastmod),
      );
    } else {
      children = children
        .sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))
        .slice(0, RECENT_CHILDREN_WITHOUT_SINCE);
    }

    const refs: PageRef[] = [];
    for (const child of children) {
      const sitemap = await readSitemap(ctx.fetch, child.loc);
      for (const e of sitemap.entries) {
        if (e.loc.startsWith(GUIDE_PREFIX)) {
          refs.push({ url: e.loc, remoteModified: e.lastmod });
        }
      }
    }
    return refs;
  },
  extract: extractorFor([".entry-content", "article", "main"]),
};
