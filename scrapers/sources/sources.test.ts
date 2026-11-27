import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createPoliteFetcher } from "../fetch/politeFetch";
import { fakeNetwork, type FakeRoutes } from "../test-helpers";
import type { PageRef, SourceModule } from "../types";
import { SOURCES } from "./index";
import { game8jp } from "./game8jp";
import { gamewith } from "./gamewith";
import { gtabase } from "./gtabase";
import { ign } from "./ign";
import { keengamer } from "./keengamer";
import { powerpyx } from "./powerpyx";
import { vandal } from "./vandal";

function discover(
  mod: SourceModule,
  routes: FakeRoutes,
  since?: string,
  feedOnly?: boolean,
) {
  const net = fakeNetwork(routes);
  const { get } = createPoliteFetcher({
    ...net.deps,
    defaultIntervalMs: 0,
  }).forSource(0);
  const logs: string[] = [];
  const refs: Promise<PageRef[]> = mod.discover({
    fetch: get,
    since,
    feedOnly,
    log: (m) => logs.push(m),
  });
  return { refs, net, logs };
}

const urlset = (...entries: [string, string?][]) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries
    .map(
      ([loc, lastmod]) =>
        `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
    )
    .join("")}</urlset>`;
const index = (...entries: [string, string?][]) =>
  `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries
    .map(
      ([loc, lastmod]) =>
        `<sitemap><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</sitemap>`,
    )
    .join("")}</sitemapindex>`;

describe("registry", () => {
  it("lists the eight sources in rank order, all enabled, with unique ids", () => {
    expect(SOURCES.map((s) => s.id)).toEqual([
      "powerpyx",
      "gtabase",
      "ign",
      "keengamer",
      "game8jp",
      "gamewith",
      "vandal",
      "github",
    ]);
    expect(SOURCES.every((s) => s.enabled)).toBe(true);
  });
});

describe("single-sitemap sources", () => {
  it.each([
    {
      mod: ign,
      sitemap: "https://www.ign.com/rss/sitemap-wikis-gta-6.xml",
      xml: urlset([
        "https://www.ign.com/wikis/gta-6/made-up",
        "2026-11-24T10:00:00+00:00",
      ]),
      body: (xml: string) => xml,
      expected: [
        {
          url: "https://www.ign.com/wikis/gta-6/made-up",
          remoteModified: "2026-11-24T10:00:00.000Z",
        },
      ],
    },
    {
      mod: gamewith,
      sitemap: "https://gamewith.jp/gta6/sitemap.xml",
      xml: urlset(
        ["https://gamewith.jp/gta6/123456", "2026-11-23"],
        ["https://gamewith.jp/gta6/about"],
        ["https://gamewith.jp/other/99"],
      ),
      body: (xml: string) => xml,
      expected: [
        {
          url: "https://gamewith.jp/gta6/123456",
          remoteModified: "2026-11-23T00:00:00.000Z",
        },
      ],
    },
    {
      mod: game8jp,
      sitemap: "https://game8.jp/sitemaps/game_1733.xml.gz",
      xml: urlset(
        ["https://game8.jp/gta6/555", "2026-11-22"],
        ["https://game8.jp/gta6/556?utm=x"],
        ["https://game8.jp/gta6/top"],
      ),
      body: (xml: string) => gzipSync(xml),
      expected: [
        {
          url: "https://game8.jp/gta6/555",
          remoteModified: "2026-11-22T00:00:00.000Z",
        },
      ],
    },
  ])(
    "$mod.id keeps only its guide pages and reads lastmod",
    async ({ mod, sitemap, xml, body, expected }) => {
      const { refs } = discover(mod, { [sitemap]: { body: body(xml) } });
      await expect(refs).resolves.toEqual(expected);
    },
  );

  it("fails clearly when the sitemap can't be read", async () => {
    const { refs } = discover(ign, {});
    await expect(refs).rejects.toThrow(/sitemap .* http-error 404/);
  });
});

describe("gtabase", () => {
  it("reads every English child of the index and keeps /gta-6/ URLs with per-URL lastmod", async () => {
    const { refs } = discover(gtabase, {
      "https://www.gtabase.com/sitemap-4seo.xml": {
        body: index(
          ["https://www.gtabase.com/sitemap.en-GB.4seo.1.xml", "2026-11-26"],
          ["https://www.gtabase.com/sitemap.en-GB.4seo.2.xml", "2026-11-26"],
          ["https://www.gtabase.com/sitemap.de-DE.4seo.1.xml", "2026-11-26"],
        ),
      },
      "https://www.gtabase.com/sitemap.en-GB.4seo.1.xml": {
        body: urlset(
          ["https://www.gtabase.com/gta-6/missions", "2026-11-20"],
          ["https://www.gtabase.com/gta-5/x", "2026-11-20"],
        ),
      },
      "https://www.gtabase.com/sitemap.en-GB.4seo.2.xml": {
        body: urlset(["https://www.gtabase.com/gta-6/vehicles", "2026-11-25"]),
      },
    });
    expect((await refs).map((r) => [r.url, r.remoteModified])).toEqual([
      ["https://www.gtabase.com/gta-6/missions", "2026-11-20T00:00:00.000Z"],
      ["https://www.gtabase.com/gta-6/vehicles", "2026-11-25T00:00:00.000Z"],
    ]);
  });
});

describe("keengamer", () => {
  const FEED = "https://www.keengamer.com/feed/";
  const INDEX = "https://www.keengamer.com/sitemap_index.xml";
  const GUIDE =
    "https://www.keengamer.com/articles/guides/gta-6-made-up-guide/";
  const NEWS = "https://www.keengamer.com/articles/news/gta-6-made-up-news/";
  const feedXml = readFileSync(
    new URL("../__fixtures__/keengamer-feed.xml", import.meta.url),
    "utf8",
  );
  const feedRoute = { [FEED]: { body: feedXml } };
  const articleCalls = (net: ReturnType<typeof discover>["net"]) =>
    net.pageCalls().filter((c) => c.url.includes("/articles/"));

  it("keeps the feed items tagged Grand Theft Auto VI on keengamer.com, keyed by canonical URL with the body in hand", async () => {
    const { refs, net } = discover(keengamer, feedRoute, undefined, true);
    const result = await refs;

    expect(result.map((r) => [r.url, r.title])).toEqual([
      [GUIDE, "Made Up Guide: Mission m2 Walkthrough"],
      [NEWS, "Made Up News: A Trailer Appears"],
    ]);
    expect(result[0].body).toContain("<h2>Before you start</h2>");
    expect(result[0].body).toContain("marker &amp; wait");
    expect(result[0].published).toBe("2026-11-27T14:00:00.000Z");
    expect(result[0].remoteModified).toBeUndefined();
    // feed-only: one request, no sitemaps
    expect(net.pageCalls().map((c) => c.url)).toEqual([FEED]);
  });

  it("extracts the article text from the feed body", async () => {
    const [ref] = await discover(keengamer, feedRoute, undefined, true).refs;
    expect(keengamer.extract!(ref.body!, ref.url).text).toBe(
      [
        "## Before you start",
        "Mission m2 opens after m1.",
        "- Bring a spare car.",
        "## The run",
        "Drive to the made-up marker & wait.",
      ].join("\n"),
    );
  });

  it("adds sitemap lastmod to matched items, reads only post sitemaps at or after --since, and never fetches an article page", async () => {
    const { refs, net } = discover(
      keengamer,
      {
        ...feedRoute,
        [INDEX]: {
          body: index(
            [
              "https://www.keengamer.com/post-sitemap1.xml",
              "2026-01-01T00:00:00Z",
            ],
            [
              "https://www.keengamer.com/post-sitemap9.xml",
              "2026-11-25T00:00:00Z",
            ],
            [
              "https://www.keengamer.com/page-sitemap.xml",
              "2026-11-25T00:00:00Z",
            ],
          ),
        },
        "https://www.keengamer.com/post-sitemap9.xml": {
          body: urlset(
            [GUIDE, "2026-11-27T15:00:00Z"],
            // In the sitemap but not in the feed: never turned into a page to fetch.
            [
              "https://www.keengamer.com/articles/guides/gta-6-not-in-feed/",
              "2026-11-26",
            ],
          ),
        },
      },
      "2026-11-20",
    );
    const result = await refs;

    expect(result.map((r) => [r.url, r.remoteModified])).toEqual([
      [GUIDE, "2026-11-27T15:00:00.000Z"],
      [NEWS, undefined],
    ]);
    expect(net.pageCalls().map((c) => c.url)).not.toContain(
      "https://www.keengamer.com/post-sitemap1.xml",
    );
    expect(articleCalls(net)).toEqual([]);
  });

  it("still returns the feed's items when the sitemaps can't be read", async () => {
    const { refs, logs } = discover(keengamer, {
      ...feedRoute,
      [INDEX]: { status: 403 },
    });
    expect((await refs).map((r) => r.url)).toEqual([GUIDE, NEWS]);
    expect(logs.join(" ")).toMatch(/sitemaps unreadable/);
  });

  it.each([
    [
      "answers 403 (a challenge)",
      { [FEED]: { status: 403 } },
      /feed http-error 403/,
    ],
    ["is gone", {}, /feed http-error 404/],
    [
      "holds no items",
      { [FEED]: { body: "<rss><channel></channel></rss>" } },
      /no items/,
    ],
  ])("fails clearly when the feed %s", async (_name, routes, message) => {
    const { refs } = discover(keengamer, routes as FakeRoutes);
    await expect(refs).rejects.toThrow(message);
  });
});

describe("powerpyx", () => {
  it("returns the REST content as the page body, with modified_gmt read as UTC", async () => {
    const base =
      "https://www.powerpyx.com/wp-json/wp/v2/posts?categories=258221&per_page=100&page=1&_fields=id%2Clink%2Cmodified_gmt%2Ctitle%2Ccontent&modified_after=2026-11-12T00%3A00%3A00.000Z";
    const { refs, net } = discover(
      powerpyx,
      {
        [base]: {
          headers: { "x-wp-totalpages": "1" },
          body: JSON.stringify([
            {
              link: "https://www.powerpyx.com/made-up-guide/",
              modified_gmt: "2026-11-24T08:15:00",
              title: { rendered: "Made Up &#8211; Guide" },
              content: { rendered: "<p>Body text</p>" },
            },
          ]),
        },
      },
      "2026-11-12",
    );
    expect(await refs).toEqual([
      {
        url: "https://www.powerpyx.com/made-up-guide/",
        remoteModified: "2026-11-24T08:15:00.000Z",
        title: "Made Up – Guide",
        body: "<p>Body text</p>",
      },
    ]);
    expect(net.pageCalls()).toHaveLength(1);
  });

  it("pages until X-WP-TotalPages and sends no modified_after without --since", async () => {
    const page = (n: number) =>
      `https://www.powerpyx.com/wp-json/wp/v2/posts?categories=258221&per_page=100&page=${n}&_fields=id%2Clink%2Cmodified_gmt%2Ctitle%2Ccontent`;
    const post = (slug: string) => ({
      link: `https://www.powerpyx.com/${slug}/`,
      modified_gmt: "2026-11-20T00:00:00",
      title: { rendered: slug },
      content: { rendered: "<p>x</p>" },
    });
    const { refs, net } = discover(powerpyx, {
      [page(1)]: {
        headers: { "x-wp-totalpages": "2" },
        body: JSON.stringify([post("a")]),
      },
      [page(2)]: {
        headers: { "x-wp-totalpages": "2" },
        body: JSON.stringify([post("b")]),
      },
    });
    expect((await refs).map((r) => r.url)).toEqual([
      "https://www.powerpyx.com/a/",
      "https://www.powerpyx.com/b/",
    ]);
    expect(net.pageCalls()).toHaveLength(2);
  });
});

describe("vandal", () => {
  it("lists the hub itself (body in hand) plus unique chapter links, decoding ISO-8859-1", async () => {
    const hub =
      "https://vandal.elespanol.com/guias/guia-grand-theft-auto-vi-trucos-consejos-y-secretos";
    const bytes = Buffer.from(
      readFileSync(
        new URL("../__fixtures__/vandal-hub.html", import.meta.url),
        "utf8",
      ),
      "latin1",
    );
    const { refs } = discover(vandal, {
      [hub]: {
        body: bytes,
        headers: { "content-type": "text/html; charset=ISO-8859-1" },
      },
    });
    const result = await refs;
    expect(result.map((r) => r.url)).toEqual([
      hub,
      `${hub}/capitulo-uno`,
      `${hub}/capitulo-dos`,
    ]);
    expect(result[0].body).toContain("Guía inventada");
    expect(result[1].body).toBeUndefined();
  });
});
