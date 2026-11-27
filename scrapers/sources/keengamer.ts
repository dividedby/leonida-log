import { extractorFor } from "../extract";
import { parseRss } from "../rss";
import { readSitemap } from "../sitemap";
import type { PageRef, SourceContext, SourceModule } from "../types";
import { isLater } from "../util";

// Article pages and /rss answer 403 with a Cloudflare challenge, which is never
// worked around (ADR 0007, 2026-11-27 note), so no article page is fetched.
// /feed/ is open and robots.txt allows it: its newest 20 items carry the full
// article HTML in <description>. Items tagged GTA VI become pages with the body
// in hand. robots.txt disallows /wp-json/ and /*?, so there is no paging and no
// REST API: a poll sees only what the feed still holds (about 9 hours).
// The sitemaps are read only for each item's lastmod.
const FEED = "https://www.keengamer.com/feed/";
const INDEX = "https://www.keengamer.com/sitemap_index.xml";
const GAME = "grand theft auto vi";
const RECENT_CHILDREN_WITHOUT_SINCE = 3;
const MAX_FEED_BYTES = 8 * 1024 * 1024;

/** `https://www.keengamer.com/<path>/`, the sitemap's form, else null. Drops query and fragment. */
export function canonicalArticleUrl(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.hostname !== "www.keengamer.com" && u.hostname !== "keengamer.com") {
    return null;
  }
  const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
  return `https://www.keengamer.com${path}`;
}

/** Feed items tagged "Grand Theft Auto VI", keyed by canonical URL. Throws when the feed has no items at all. */
export function parseFeed(xml: string): PageRef[] {
  const items = parseRss(xml);
  if (items.length === 0) throw new Error("KeenGamer feed has no items");
  const refs: PageRef[] = [];
  for (const item of items) {
    if (!item.categories.some((c) => c.trim().toLowerCase() === GAME)) {
      continue;
    }
    const url = canonicalArticleUrl(item.link);
    if (!url || !item.html) continue;
    refs.push({
      url,
      title: item.title,
      body: item.html,
      published: item.published,
    });
  }
  return refs;
}

/** lastmod per canonical URL from the post sitemaps that could hold a page changed since `ctx.since`. */
async function sitemapLastmods(
  ctx: SourceContext,
): Promise<Map<string, string>> {
  const index = await readSitemap(ctx.fetch, INDEX);
  let children = index.entries.filter((e) =>
    /post-sitemap\d*\.xml/.test(e.loc),
  );
  const since = ctx.since;
  if (since) {
    children = children.filter((e) => !e.lastmod || !isLater(since, e.lastmod));
  } else {
    children = children
      .sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))
      .slice(0, RECENT_CHILDREN_WITHOUT_SINCE);
  }
  const lastmods = new Map<string, string>();
  for (const child of children) {
    const sitemap = await readSitemap(ctx.fetch, child.loc);
    for (const e of sitemap.entries) {
      const url = canonicalArticleUrl(e.loc);
      if (url && e.lastmod) lastmods.set(url, e.lastmod);
    }
  }
  return lastmods;
}

export const keengamer: SourceModule = {
  id: "keengamer",
  name: "KeenGamer",
  enabled: true,
  hosts: ["www.keengamer.com"],
  method: "rss",
  hasFeed: true,
  async discover(ctx) {
    const res = await ctx.fetch(FEED, {
      accept: "application/rss+xml,application/xml;q=0.9,text/xml;q=0.8",
      maxBytes: MAX_FEED_BYTES,
    });
    if (res.outcome !== "ok") {
      throw new Error(
        `KeenGamer feed ${res.outcome} ${res.status}${res.error ? ` (${res.error})` : ""}`,
      );
    }
    const refs = parseFeed(res.text);
    if (refs.length === 0 || ctx.feedOnly) return refs;

    // lastmod only decorates the rows: a failed sitemap must not lose the feed's content.
    let lastmods = new Map<string, string>();
    try {
      lastmods = await sitemapLastmods(ctx);
    } catch (error) {
      ctx.log(`KeenGamer sitemaps unreadable, no lastmod: ${String(error)}`);
    }
    return refs.map((ref): PageRef => {
      const remoteModified = lastmods.get(ref.url);
      return remoteModified ? { ...ref, remoteModified } : ref;
    });
  },
  extract: extractorFor([".entry-content", "article", "main"]),
};
