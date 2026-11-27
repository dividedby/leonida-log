import { parse } from "node-html-parser";
import { extractorFor } from "../extract";
import type { PageRef, SourceModule } from "../types";

// The hub lists the chapters and has no lastmod, so change detection is by
// content hash. The hub is tracked as a page itself (its body is already in
// hand); the run fetches up to maxPagesPerRun chapters, least recently checked
// first. Pages are ISO-8859-1; the fetch layer decodes by Content-Type.
const HUB =
  "https://vandal.elespanol.com/guias/guia-grand-theft-auto-vi-trucos-consejos-y-secretos";
const CHAPTER =
  /^\/guias\/guia-grand-theft-auto-vi-trucos-consejos-y-secretos\/[^/?#]+$/;

export const vandal: SourceModule = {
  id: "vandal",
  name: "Vandal",
  enabled: true,
  hosts: ["vandal.elespanol.com"],
  method: "html-index",
  maxPagesPerRun: 20,
  async discover(ctx) {
    const res = await ctx.fetch(HUB);
    if (res.outcome !== "ok") {
      throw new Error(`Vandal hub ${res.outcome} ${res.status}`);
    }
    const chapters = new Map<string, PageRef>();
    for (const a of parse(res.text).querySelectorAll("a[href]")) {
      let url: URL;
      try {
        url = new URL(a.getAttribute("href") ?? "", HUB);
      } catch {
        continue;
      }
      if (url.host !== "vandal.elespanol.com" || !CHAPTER.test(url.pathname)) {
        continue;
      }
      const clean = `${url.origin}${url.pathname}`;
      if (!chapters.has(clean)) chapters.set(clean, { url: clean });
    }
    return [{ url: HUB, body: res.text }, ...chapters.values()];
  },
  extract: extractorFor(["article", "#contenido", "main"]),
};
