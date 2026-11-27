import { extractorFor } from "../extract";
import { readSitemap } from "../sitemap";
import type { PageRef, SourceModule } from "../types";

// The index's own lastmod regenerates daily, so it says nothing: read every
// child and compare per-URL lastmod.
const INDEX = "https://www.gtabase.com/sitemap-4seo.xml";

export const gtabase: SourceModule = {
  id: "gtabase",
  name: "GTABase",
  enabled: true,
  hosts: ["www.gtabase.com"],
  method: "sitemap",
  async discover(ctx) {
    const index = await readSitemap(ctx.fetch, INDEX);
    const english = index.entries.filter((e) =>
      /sitemap\.en-GB\.4seo\.\d+\.xml/.test(e.loc),
    );
    const children = english.length > 0 ? english : index.entries;
    const refs: PageRef[] = [];
    for (const child of children) {
      const sitemap = await readSitemap(ctx.fetch, child.loc);
      for (const e of sitemap.entries) {
        if (e.loc.includes("/gta-6/")) {
          refs.push({ url: e.loc, remoteModified: e.lastmod });
        }
      }
    }
    return refs;
  },
  extract: extractorFor(["article", ".item-page", "main"]),
};
