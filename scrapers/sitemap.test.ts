import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseSitemap } from "./sitemap";

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://a.test/one?x=1&amp;y=2</loc><lastmod>2026-11-20T10:30:00+00:00</lastmod></url>
  <url><loc>https://a.test/two</loc><lastmod>2026-11-21</lastmod></url>
  <url><loc>https://a.test/three</loc></url>
</urlset>`;

const INDEX = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://a.test/s1.xml</loc><lastmod>2026-11-22T00:00:00Z</lastmod></sitemap>
  <sitemap><loc>https://a.test/s2.xml</loc></sitemap>
</sitemapindex>`;

describe("parseSitemap", () => {
  it("reads a urlset with decoded URLs and ISO UTC lastmod", () => {
    expect(parseSitemap(URLSET)).toEqual({
      kind: "urlset",
      entries: [
        {
          loc: "https://a.test/one?x=1&y=2",
          lastmod: "2026-11-20T10:30:00.000Z",
        },
        { loc: "https://a.test/two", lastmod: "2026-11-21T00:00:00.000Z" },
        { loc: "https://a.test/three", lastmod: undefined },
      ],
    });
  });

  it("reads a sitemap index", () => {
    expect(parseSitemap(INDEX)).toEqual({
      kind: "index",
      entries: [
        { loc: "https://a.test/s1.xml", lastmod: "2026-11-22T00:00:00.000Z" },
        { loc: "https://a.test/s2.xml", lastmod: undefined },
      ],
    });
  });

  it("reads gzip bytes the same as text", () => {
    expect(parseSitemap(gzipSync(URLSET))).toEqual(parseSitemap(URLSET));
  });
});
