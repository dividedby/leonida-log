import { afterEach, describe, expect, it } from "vitest";
import { fixtureData } from "../lib/test-fixtures/curated";
import { openDatabase, type OpenedDatabase } from "../lib/db/open";
import { candidates, sources } from "../lib/db/schema";
import { tempDbs } from "../lib/db/test-helpers";
import { createPoliteFetcher } from "./fetch/politeFetch";
import { runScrape, selectSources, type SourceStats } from "./run";
import { fakeNetwork, type FakeRoutes } from "./test-helpers";
import { keengamer } from "./sources/keengamer";
import type { PageRef, SourceModule } from "./types";

const dbs = tempDbs();
const curated = fixtureData();
const NOW = new Date("2026-11-26T12:00:00Z");

const open: OpenedDatabase[] = [];
afterEach(() => {
  for (const o of open.splice(0)) o.close();
});

const html = (title: string, ...paragraphs: string[]) =>
  `<html><body><main><h1>${title}</h1>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</main></body></html>`;

function fakeModule(
  listing: () => PageRef[],
  over: Partial<SourceModule> = {},
): SourceModule {
  return {
    id: "fake",
    name: "Fake",
    enabled: true,
    hosts: ["guide.test"],
    method: "sitemap",
    discover: async () => listing(),
    ...over,
  };
}

function setup(
  routes: FakeRoutes,
  listing: () => PageRef[],
  over: Partial<SourceModule> = {},
) {
  const opened = openDatabase(dbs.fresh());
  open.push(opened);
  const net = fakeNetwork(routes);
  const fetcher = createPoliteFetcher({ ...net.deps, defaultIntervalMs: 0 });
  const mod = fakeModule(listing, over);
  const scrape = (
    extra: { since?: string; dryRun?: boolean } = {},
  ): Promise<SourceStats[]> =>
    runScrape({
      db: opened.db,
      curated,
      modules: [mod],
      fetcher,
      now: () => NOW,
      ...extra,
    });
  return {
    opened,
    net,
    scrape,
    rows: () => opened.db.select().from(sources).all(),
    cands: () => opened.db.select().from(candidates).all(),
  };
}

const A = "https://guide.test/a";
const B = "https://guide.test/b";
const C = "https://guide.test/c";

describe("change detection", () => {
  it("emits a new candidate per page on the first run, with hints and a diff summary", async () => {
    const t = setup(
      {
        [A]: {
          body: html("Guide A", "Finish Mission m2 first.", "Then more."),
        },
      },
      () => [{ url: A, remoteModified: "2026-11-25T00:00:00Z" }],
    );
    const [stats] = await t.scrape();
    expect(stats).toMatchObject({
      discovered: 1,
      fetched: 1,
      new: 1,
      changed: 0,
    });
    const [c] = t.cands();
    expect(c).toMatchObject({
      changeKind: "new",
      status: "new",
      missionHint: "m2",
      gateHint: "m3",
    });
    expect(c.rawExtract).toContain("Finish Mission m2 first.");
    expect(JSON.parse(c.diffSummary!)).toMatchObject({
      headingsAdded: ["Guide A"],
      paragraphsAdded: 2,
    });
    expect(t.rows()[0]).toMatchObject({
      source: "fake",
      host: "guide.test",
      httpStatus: 200,
    });
  });

  it("fetches nothing and emits nothing when lastmod hasn't moved", async () => {
    const t = setup({ [A]: { body: html("Guide A", "Text.") } }, () => [
      { url: A, remoteModified: "2026-11-25T00:00:00Z" },
    ]);
    await t.scrape();
    const fetchedBefore = t.net.pageCalls().length;
    const [stats] = await t.scrape();
    expect(t.net.pageCalls().length).toBe(fetchedBefore);
    expect(stats).toMatchObject({
      fetched: 0,
      unchanged: 1,
      new: 0,
      changed: 0,
    });
    expect(t.cands()).toHaveLength(1);
  });

  it("moves remote_modified without a candidate when lastmod moved but content is the same", async () => {
    let lastmod = "2026-11-25T00:00:00Z";
    const t = setup({ [A]: { body: html("Guide A", "Text.") } }, () => [
      { url: A, remoteModified: lastmod },
    ]);
    await t.scrape();
    lastmod = "2026-11-26T09:00:00Z";
    const [stats] = await t.scrape();
    expect(stats).toMatchObject({
      fetched: 1,
      unchanged: 1,
      changed: 0,
      new: 0,
    });
    expect(t.cands()).toHaveLength(1);
    expect(t.rows()[0].remoteModified).toBe("2026-11-26T09:00:00Z");
  });

  it("emits one modified candidate with a diff summary when content changes, sending stored validators", async () => {
    let lastmod = "2026-11-25T00:00:00Z";
    let body = html("Guide A", "Old text.");
    const routes: FakeRoutes = {};
    const t = setup(routes, () => [{ url: A, remoteModified: lastmod }]);
    routes[A] = { body, headers: { etag: '"v1"' } };
    await t.scrape();

    lastmod = "2026-11-26T09:00:00Z";
    body = html("Guide A", "Old text.", "Brand new paragraph.");
    routes[A] = { body };
    const [stats] = await t.scrape();

    expect(stats).toMatchObject({ changed: 1, new: 0 });
    expect(t.net.pageCalls().at(-1)!.headers["if-none-match"]).toBe('"v1"');
    const modified = t.cands().filter((c) => c.changeKind === "modified");
    expect(modified).toHaveLength(1);
    expect(JSON.parse(modified[0].diffSummary!)).toMatchObject({
      paragraphsAdded: 1,
      paragraphsRemoved: 0,
      snippets: ["Brand new paragraph."],
    });
    expect(t.rows()[0].changedAt).not.toBeNull();
  });

  it("treats a 304 as unchanged", async () => {
    let lastmod = "2026-11-25T00:00:00Z";
    const routes: FakeRoutes = {
      [A]: { body: html("Guide A", "Text."), headers: { etag: '"v1"' } },
    };
    const t = setup(routes, () => [{ url: A, remoteModified: lastmod }]);
    await t.scrape();
    lastmod = "2026-11-26T00:00:00Z";
    routes[A] = { status: 304 };
    const [stats] = await t.scrape();
    expect(stats).toMatchObject({ unchanged: 1, changed: 0 });
    expect(t.cands()).toHaveLength(1);
  });

  it("emits nothing for pages whose listing gave the body when the hash is unchanged", async () => {
    const t = setup({}, () => [{ url: A, body: html("Guide A", "Text.") }]);
    await t.scrape();
    const [second] = await t.scrape();
    expect(t.net.pageCalls()).toHaveLength(0);
    expect(second.unchanged).toBe(1);
    expect(t.cands()).toHaveLength(1);
  });
});

describe("--since and first runs", () => {
  it("records pages older than --since as baselines without fetching, then fetches them once lastmod moves", async () => {
    let lastmod = "2026-10-01T00:00:00Z";
    const t = setup({ [A]: { body: html("Guide A", "Text.") } }, () => [
      { url: A, remoteModified: lastmod },
    ]);
    const [first] = await t.scrape({ since: "2026-11-01" });
    expect(first).toMatchObject({ baselined: 1, fetched: 0 });
    expect(t.net.pageCalls()).toHaveLength(0);
    expect(t.cands()).toHaveLength(0);
    expect(t.rows()[0]).toMatchObject({
      remoteModified: lastmod,
      contentHash: null,
    });

    lastmod = "2026-11-20T00:00:00Z";
    const [second] = await t.scrape({ since: "2026-11-01" });
    expect(second).toMatchObject({ fetched: 1, new: 1 });
    expect(t.cands()[0].changeKind).toBe("new");
  });

  it("defaults to 14 days back on a source's first run only", async () => {
    const t = setup(
      {
        [A]: { body: html("Guide A", "Text.") },
        [B]: { body: html("Guide B", "Text.") },
      },
      () => [
        { url: A, remoteModified: "2026-11-20T00:00:00Z" },
        { url: B, remoteModified: "2026-10-01T00:00:00Z" },
      ],
    );
    const [first] = await t.scrape();
    expect(first).toMatchObject({ baselined: 1, new: 1 });
    // Second run has rows: B's lastmod is unchanged, so no fetch and no new baseline.
    const [second] = await t.scrape();
    expect(second).toMatchObject({ baselined: 0, fetched: 0 });
  });
});

describe("limits", () => {
  it("defers pages over maxPagesPerRun, newest first, and picks them up next run", async () => {
    const routes: FakeRoutes = {
      [A]: { body: html("A", "a") },
      [B]: { body: html("B", "b") },
      [C]: { body: html("C", "c") },
    };
    const t = setup(
      routes,
      () => [
        { url: A, remoteModified: "2026-11-21T00:00:00Z" },
        { url: B, remoteModified: "2026-11-25T00:00:00Z" },
        { url: C, remoteModified: "2026-11-23T00:00:00Z" },
      ],
      { maxPagesPerRun: 2 },
    );
    const [first] = await t.scrape();
    expect(first).toMatchObject({ fetched: 2, deferred: 1, new: 2 });
    expect(
      t
        .rows()
        .map((r) => r.url)
        .sort(),
    ).toEqual([B, C]);

    const [second] = await t.scrape();
    expect(second).toMatchObject({ fetched: 1, new: 1, deferred: 0 });
    expect(t.rows()).toHaveLength(3);
  });

  it("stops at a 403 and defers the remaining pages without recording them", async () => {
    const t = setup(
      { [A]: { status: 403 }, [B]: { body: html("B", "b") } },
      () => [
        { url: A, remoteModified: "2026-11-25T00:00:00Z" },
        { url: B, remoteModified: "2026-11-24T00:00:00Z" },
      ],
    );
    const [stats] = await t.scrape();
    expect(stats).toMatchObject({ errors: 1, deferred: 1, new: 0 });
    expect(t.rows()).toHaveLength(0);
  });

  it("counts a robots-blocked page and records nothing", async () => {
    const t = setup(
      {
        "https://guide.test/robots.txt": {
          body: "User-agent: *\nDisallow: /a\n",
        },
      },
      () => [{ url: A, remoteModified: "2026-11-25T00:00:00Z" }],
    );
    const [stats] = await t.scrape();
    expect(stats).toMatchObject({ blockedByRobots: 1, new: 0, errors: 0 });
    expect(t.rows()).toHaveLength(0);
  });

  it("reports a failed listing as an error and carries on", async () => {
    const t = setup({}, () => {
      throw new Error("listing down");
    });
    const [stats] = await t.scrape();
    expect(stats).toMatchObject({ errors: 1, discoveryError: "listing down" });
  });
});

describe("dry run", () => {
  it("fetches and counts but writes nothing", async () => {
    const t = setup({ [A]: { body: html("A", "a") } }, () => [
      { url: A, remoteModified: "2026-11-25T00:00:00Z" },
    ]);
    const [stats] = await t.scrape({ dryRun: true });
    expect(stats).toMatchObject({ fetched: 1, new: 1 });
    expect(t.rows()).toHaveLength(0);
    expect(t.cands()).toHaveLength(0);
  });
});

describe("selectSources", () => {
  const mods = [
    fakeModule(() => [], { id: "one" }),
    fakeModule(() => [], { id: "two" }),
    fakeModule(() => [], { id: "off", enabled: false }),
  ];

  it("skips modules switched off in code and by SCRAPERS_DISABLED", () => {
    expect(selectSources(mods, undefined, undefined).map((m) => m.id)).toEqual([
      "one",
      "two",
    ]);
    expect(selectSources(mods, undefined, " Two ,x").map((m) => m.id)).toEqual([
      "one",
    ]);
  });

  it("filters with --source and rejects unknown or disabled ids with a clear message", () => {
    expect(selectSources(mods, ["two"], undefined).map((m) => m.id)).toEqual([
      "two",
    ]);
    expect(() => selectSources(mods, ["nope"], undefined)).toThrow(
      /Unknown source "nope"/,
    );
    expect(() => selectSources(mods, ["off"], undefined)).toThrow(/disabled/);
    expect(() => selectSources(mods, ["one"], "one")).toThrow(/disabled/);
  });
});

describe("fallback after a mid-run host stop", () => {
  const G = (n: number) =>
    `https://www.keengamer.com/articles/guides/gta-6-guide-${n}/`;
  const CDX =
    "https://web.archive.org/cdx/search/cdx?url=keengamer.com%2Farticles%2Fguides%2Fgta-6-&output=json&fl=timestamp%2Coriginal%2Cstatuscode%2Cdigest&collapse=digest&filter=statuscode%3A200&from=20261120&matchType=prefix";
  const raw = (ts: string, url: string) =>
    `https://web.archive.org/web/${ts}id_/${url}`;

  it("fetches Wayback captures for pages left pending when KeenGamer returns repeated 5xx", async () => {
    const entries = [1, 2, 3, 4, 5].map(
      (n) =>
        `<url><loc>${G(n)}</loc><lastmod>2026-11-2${6 - n}T00:00:00Z</lastmod></url>`,
    );
    const net = fakeNetwork({
      "https://www.keengamer.com/sitemap_index.xml": {
        body: `<sitemapindex><sitemap><loc>https://www.keengamer.com/post-sitemap9.xml</loc><lastmod>2026-11-25T00:00:00Z</lastmod></sitemap></sitemapindex>`,
      },
      "https://www.keengamer.com/post-sitemap9.xml": {
        body: `<urlset>${entries.join("")}</urlset>`,
      },
      [G(1)]: { status: 500 },
      [G(2)]: { status: 500 },
      [G(3)]: { status: 500 },
      [CDX]: {
        body: JSON.stringify([
          ["timestamp", "original", "statuscode", "digest"],
          // guide 4 (lastmod 11-22): a newer capture exists. Guide 5 (lastmod 11-21): only an older one.
          [
            "20261124100000",
            `http://keengamer.com${new URL(G(4)).pathname.slice(0, -1)}`,
            "200",
            "A",
          ],
          ["20261120000000", G(5), "200", "B"],
        ]),
      },
      [raw("20261124100000", G(4))]: {
        body: html("Archived guide four", "Mission m2 was archived."),
      },
    });
    const opened = openDatabase(dbs.fresh());
    open.push(opened);
    const [stats] = await runScrape({
      db: opened.db,
      curated,
      modules: [keengamer],
      fetcher: createPoliteFetcher({ ...net.deps, defaultIntervalMs: 0 }),
      since: "2026-11-20",
      now: () => NOW,
    });

    expect(stats).toMatchObject({ errors: 3, new: 1, deferred: 1 });
    expect(net.pageCalls().map((c) => c.url)).toContain(
      raw("20261124100000", G(4)),
    );
    const rows = opened.db.select().from(sources).all();
    expect(rows.map((r) => r.url)).toEqual([G(4)]);
    expect(rows[0].remoteModified).toBe("2026-11-24T10:00:00.000Z");
    expect(opened.db.select().from(candidates).all()).toHaveLength(1);
  });
});
