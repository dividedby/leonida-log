import { parse } from "node-html-parser";
import type { PageRef, SourceModule } from "../types";
import { toIso } from "../util";

// Category 258221 is "GTA 6 (Grand Theft Auto VI)". The REST list returns the
// rendered content, so no per-page fetch is needed. `orderby=modified` is
// rejected (400): use the default order.
const ENDPOINT = "https://www.powerpyx.com/wp-json/wp/v2/posts";
const PER_PAGE = 100;
const MAX_LIST_PAGES = 20;
// 100 full guides per page can pass the default 5 MB cap.
const MAX_LIST_BYTES = 32 * 1024 * 1024;

interface WpPost {
  link?: string;
  modified_gmt?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
}

export const powerpyx: SourceModule = {
  id: "powerpyx",
  name: "PowerPyx",
  enabled: true,
  hosts: ["www.powerpyx.com"],
  method: "wp-rest",
  async discover(ctx) {
    const refs: PageRef[] = [];
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const params = new URLSearchParams({
        categories: "258221",
        per_page: String(PER_PAGE),
        page: String(page),
        _fields: "id,link,modified_gmt,title,content",
      });
      if (ctx.since) {
        params.set("modified_after", toIso(ctx.since) ?? ctx.since);
      }
      const res = await ctx.fetch(`${ENDPOINT}?${params}`, {
        accept: "application/json",
        maxBytes: MAX_LIST_BYTES,
      });
      if (res.outcome !== "ok") {
        // Past the last page WP answers 400; later pages failing keeps page 1's data.
        if (page === 1) {
          throw new Error(`PowerPyx REST ${res.outcome} ${res.status}`);
        }
        ctx.log(`PowerPyx REST page ${page}: ${res.outcome} ${res.status}`);
        break;
      }
      const posts = JSON.parse(res.text) as WpPost[];
      if (posts.length === 0) break;
      for (const p of posts) {
        if (!p.link) continue;
        refs.push({
          url: p.link,
          // modified_gmt is UTC without a zone.
          remoteModified: toIso(p.modified_gmt),
          title: p.title?.rendered
            ? parse(p.title.rendered).text.trim()
            : undefined,
          body: p.content?.rendered ?? "",
        });
      }
      const totalPages = Number(res.headers.get("x-wp-totalpages"));
      if (Number.isFinite(totalPages) && totalPages > 0 && page >= totalPages) {
        break;
      }
    }
    return refs;
  },
};
