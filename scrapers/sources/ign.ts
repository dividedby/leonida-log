import { extractorFor } from "../extract";
import { readSitemap } from "../sitemap";
import type { SourceModule } from "../types";

// Ziff Davis's terms of use ban automated retrieval. The owner chose breadth
// over a per-site terms allowlist (ADR 0007). Remove this module (and purge
// its candidates) if IGN objects.
const SITEMAP = "https://www.ign.com/rss/sitemap-wikis-gta-6.xml";

export const ign: SourceModule = {
  id: "ign",
  name: "IGN",
  enabled: true,
  hosts: ["www.ign.com"],
  method: "sitemap",
  maxPagesPerRun: 40,
  async discover(ctx) {
    const sitemap = await readSitemap(ctx.fetch, SITEMAP);
    return sitemap.entries.map((e) => ({
      url: e.loc,
      remoteModified: e.lastmod,
    }));
  },
  extract: extractorFor(['[data-cy="wiki-page"]', ".wiki-page", "main"]),
};
