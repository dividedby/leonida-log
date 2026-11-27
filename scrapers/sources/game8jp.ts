import { extractorFor } from "../extract";
import { readSitemap } from "../sitemap";
import type { SourceModule } from "../types";

// game_id 1733 is GTA 6. The gzipped sitemap redirects to an S3 host; its
// robots.txt answers 4xx, which RFC 9309 reads as allow-all. Query-string URLs
// are never fetched. Pages carry JSON-LD dateModified (read by the extractor).
const SITEMAP = "https://game8.jp/sitemaps/game_1733.xml.gz";
const PAGE = /^https:\/\/game8\.jp\/gta6\/\d+$/;

export const game8jp: SourceModule = {
  id: "game8jp",
  name: "Game8 JP",
  enabled: true,
  hosts: ["game8.jp", "s3-ap-northeast-1.amazonaws.com"],
  method: "sitemap",
  async discover(ctx) {
    const sitemap = await readSitemap(ctx.fetch, SITEMAP);
    return sitemap.entries
      .filter((e) => PAGE.test(e.loc))
      .map((e) => ({ url: e.loc, remoteModified: e.lastmod }));
  },
  extract: extractorFor(["main", "article", ".archive-style-wrapper"]),
};
