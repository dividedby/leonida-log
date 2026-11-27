import { extractorFor } from "../extract";
import { readSitemap } from "../sitemap";
import type { SourceModule } from "../types";

const SITEMAP = "https://gamewith.jp/gta6/sitemap.xml";
const PAGE = /^https:\/\/gamewith\.jp\/gta6\/\d+$/;

export const gamewith: SourceModule = {
  id: "gamewith",
  name: "GameWith",
  enabled: true,
  hosts: ["gamewith.jp"],
  method: "sitemap",
  async discover(ctx) {
    const sitemap = await readSitemap(ctx.fetch, SITEMAP);
    return sitemap.entries
      .filter((e) => PAGE.test(e.loc))
      .map((e) => ({ url: e.loc, remoteModified: e.lastmod }));
  },
  extract: extractorFor(["#article-body", "main", "article"]),
};
