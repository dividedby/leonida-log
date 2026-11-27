import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type OpenedDatabase } from "../../lib/db/open";
import { candidates, sources } from "../../lib/db/schema";
import { tempDbs } from "../../lib/db/test-helpers";
import { fixtureData } from "../../lib/test-fixtures/curated";
import { createPoliteFetcher } from "../fetch/politeFetch";
import { runCli } from "../main";
import { runScrape } from "../run";
import { fakeClock } from "../test-helpers";
import { github, makeGithubSource, SEARCH_URL, TIER_LINE } from "./github";
import {
  loadGithubConfig,
  parseGithubConfig,
  type GithubConfig,
} from "./githubConfig";

const dbs = tempDbs();
const curated = fixtureData();
const NOW = new Date("2026-11-26T12:00:00Z");
const DAY = 86_400_000;

const open: OpenedDatabase[] = [];
const tmpDirs: string[] = [];
afterEach(() => {
  for (const o of open.splice(0)) o.close();
  for (const d of tmpDirs.splice(0))
    rmSync(d, { recursive: true, force: true });
});

const config: GithubConfig = {
  watch: [
    { repo: "own/data", paths: ["tables/a.tsv", "tables/b.tsv", "README.md"] },
    { repo: "own/dump", paths: ["Huge.txt"] },
  ],
  discovery: {
    query: 'gta6 OR "gta vi"',
    every_days: 7,
    keywords: ["data", "dump", "strings", "mission"],
    exclude_patterns: ["pc[ -]?port", "download"],
    blocklist: ["evil/gta6-data"],
  },
  max_inline_bytes: 5000,
};

interface FileState {
  sha: string;
  date: string;
  message: string;
  size: number;
  content: string;
}

/** A fake api.github.com: files with a last commit, compare results, search hits and a rate budget. */
function fakeGithub() {
  const files: Record<string, FileState> = {};
  const compares: Record<
    string,
    { commits: unknown[]; files: unknown[] } | number
  > = {};
  const state = {
    remaining: 50,
    /** Status to answer every request with (e.g. 403 with remaining 0). */
    forceStatus: 0,
    searchItems: [] as unknown[],
    searchStatus: 200,
  };
  const calls: { url: string; headers: Record<string, string>; at: number }[] =
    [];
  const clock = fakeClock();

  const json = (
    body: unknown,
    extra: Record<string, string> = {},
    status = 200,
  ) => ({ status, body: JSON.stringify(body), extra });

  function handle(url: URL, headers: Record<string, string>) {
    const p = decodeURIComponent(url.pathname);
    if (p === "/robots.txt") return { status: 404, body: "", extra: {} };
    const commits = /^\/repos\/([^/]+\/[^/]+)\/commits$/.exec(p);
    if (commits) {
      const file = files[`${commits[1]}:${url.searchParams.get("path")}`];
      const etag = `W/"${file?.sha}"`;
      if (file && headers["if-none-match"] === etag) {
        return { status: 304, body: "", extra: { etag }, free: true };
      }
      if (!file) return json([]);
      return json(
        [
          {
            sha: file.sha,
            commit: {
              message: `${file.message}\n\nbody`,
              committer: { date: file.date },
            },
          },
        ],
        { etag },
      );
    }
    const contents = /^\/repos\/([^/]+\/[^/]+)\/contents\/?(.*)$/.exec(p);
    if (contents) {
      const [, repo, path] = contents;
      if (url.searchParams.has("ref")) {
        const file = files[`${repo}:${path}`];
        return file
          ? { status: 200, body: file.content, extra: {} }
          : { status: 404, body: "", extra: {} };
      }
      const entries = Object.entries(files)
        .filter(([k]) => k.startsWith(`${repo}:`))
        .map(([k, f]) => ({ path: k.slice(repo.length + 1), f }))
        .filter(
          ({ path: fp }) =>
            fp.slice(0, Math.max(fp.lastIndexOf("/"), 0)) === path ||
            (path === "" && !fp.includes("/")),
        )
        .map(({ path: fp, f }) => ({ path: fp, size: f.size, type: "file" }));
      return json(entries);
    }
    const compare = /^\/repos\/([^/]+\/[^/]+)\/compare\/(.+)$/.exec(p);
    if (compare) {
      const found = compares[`${compare[1]}:${compare[2]}`];
      if (typeof found === "number") return json({}, {}, found);
      return found ? json(found) : json({}, {}, 404);
    }
    if (p === "/search/repositories") {
      return json({ items: state.searchItems }, {}, state.searchStatus);
    }
    return { status: 404, body: "", extra: {} };
  }

  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(
        ([k, v]) => [k.toLowerCase(), v],
      ),
    );
    calls.push({ url: url.href, headers, at: clock.now() });
    const r = handle(url, headers) as {
      status: number;
      body: string;
      extra: Record<string, string>;
      free?: boolean;
    };
    if (url.pathname === "/robots.txt") {
      return new Response("", { status: 404 });
    }
    if (!r.free) state.remaining--;
    const resHeaders: Record<string, string> = {
      ...r.extra,
      "x-ratelimit-remaining": String(Math.max(state.remaining, 0)),
      "x-ratelimit-reset": "1795000000",
    };
    if (state.forceStatus) {
      return new Response("", {
        status: state.forceStatus,
        headers: resHeaders,
      });
    }
    return new Response(r.status === 304 ? null : r.body, {
      status: r.status,
      headers: resHeaders,
    });
  }) as unknown as typeof fetch;

  return {
    files,
    compares,
    state,
    calls,
    deps: { fetch: fetchFn, now: clock.now, sleep: clock.sleep },
    /** Requests other than robots.txt. */
    api: () => calls.filter((c) => !c.url.endsWith("/robots.txt")),
    setFile(repo: string, path: string, f: Partial<FileState> = {}) {
      files[`${repo}:${path}`] = {
        sha: "a".repeat(40),
        date: "2026-11-20T10:00:00Z",
        message: "Initial dump",
        size: 100,
        content: "row1\nrow2",
        ...f,
      };
    },
  };
}

function setup(cfg: GithubConfig = config) {
  const net = fakeGithub();
  const opened = openDatabase(dbs.fresh());
  open.push(opened);
  const logs: string[] = [];
  const run = async ({
    now,
    ...extra
  }: { forceDiscovery?: string[]; dryRun?: boolean; now?: Date } = {}) =>
    (
      await runScrape({
        db: opened.db,
        curated,
        modules: [makeGithubSource(() => cfg)],
        // A fresh fetcher per run, like a fresh CLI process: host stops and robots do not carry over.
        fetcher: createPoliteFetcher({ ...net.deps, defaultIntervalMs: 0 }),
        now: () => now ?? NOW,
        log: (m) => logs.push(m),
        ...extra,
      })
    )[0];
  return {
    net,
    run,
    logs,
    cands: () => opened.db.select().from(candidates).all(),
    rows: () => opened.db.select().from(sources).all(),
  };
}

function seedFiles(net: ReturnType<typeof fakeGithub>) {
  net.setFile("own/data", "tables/a.tsv", {
    sha: "a1".repeat(20),
    content: "id\tname\n1\tOne",
  });
  net.setFile("own/data", "tables/b.tsv", { sha: "b1".repeat(20) });
  net.setFile("own/data", "README.md", { sha: "c1".repeat(20) });
  net.setFile("own/dump", "Huge.txt", {
    sha: "d1".repeat(20),
    size: 17_000_000,
    content: "SHOULD NEVER BE FETCHED",
  });
}

const repoHit = (over: Record<string, unknown> = {}) => ({
  full_name: "someone/gta6-mission-data",
  name: "gta6-mission-data",
  html_url: "https://github.com/someone/gta6-mission-data",
  description: "Mission table dump",
  topics: ["gta6"],
  stargazers_count: 12,
  pushed_at: "2026-11-25T08:00:00Z",
  license: { spdx_id: "MIT" },
  default_branch: "main",
  fork: false,
  ...over,
});

describe("config", () => {
  it("loads the shipped github.yaml", () => {
    const cfg = loadGithubConfig();
    expect(cfg.watch.map((w) => w.repo)).toEqual([
      "NotHGM/save-garage",
      "NotHGM/gta6-hash-database",
      "ahmed605/GTA6-StringsDatabase",
    ]);
    expect(cfg.watch.flatMap((w) => w.paths)).toHaveLength(11);
    expect(cfg.max_inline_bytes).toBe(1_048_576);
  });

  // Synthetic texts shaped like the first live run's false positives.
  it.each([
    ["someone/gta6-port-knowledge archive of attempts to run it on PC", true],
    ["someone/runner runs the console build with Wine on a Mac", true],
    ["someone/gta6-pc-port-saves", true],
    ["someone/extractor asset extractor: models, textures, map data", false],
    ["someone/gta6-strings string table dump", false],
  ])("shipped exclude patterns: %s → excluded %s", (text, excluded) => {
    const res = loadGithubConfig().discovery.exclude_patterns.map(
      (p) => new RegExp(p, "i"),
    );
    expect(res.some((re) => re.test(text))).toBe(excluded);
  });

  it("rejects a watched repo that is blocklisted, case-insensitively", () => {
    expect(() =>
      parseGithubConfig({
        ...config,
        watch: [{ repo: "Evil/GTA6-Data", paths: ["x"] }],
      }),
    ).toThrow(/blocklist/);
  });

  it.each([
    ["an unknown key", { ...config, extra: 1 }],
    [
      "a repo that is not owner/name",
      { ...config, watch: [{ repo: "nope", paths: ["x"] }] },
    ],
    [
      "a path that escapes the repo",
      { ...config, watch: [{ repo: "a/b", paths: ["../x"] }] },
    ],
    [
      "an invalid exclude pattern",
      {
        ...config,
        discovery: { ...config.discovery, exclude_patterns: ["("] },
      },
    ],
    ["a non-positive size limit", { ...config, max_inline_bytes: 0 }],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseGithubConfig(raw)).toThrow(/Invalid github.yaml/);
  });
});

describe("watched files", () => {
  it("emits one new candidate per path; small files give their first lines through the raw contents API; the large file is never fetched", async () => {
    const t = setup();
    seedFiles(t.net);
    t.net.files["own/data:tables/a.tsv"].content = Array.from(
      { length: 300 },
      (_, i) => `line${i + 1}`,
    ).join("\n");

    const stats = await t.run();
    expect(stats).toMatchObject({
      discovered: 4,
      new: 4,
      changed: 0,
      errors: 0,
    });

    const cands = t.cands();
    expect(cands).toHaveLength(4);
    expect(cands.every((c) => c.categoryHint === "datamine")).toBe(true);
    expect(cands.every((c) => c.changeKind === "new")).toBe(true);
    const a = cands.find((c) => c.rawExtract.includes("Path: tables/a.tsv"))!;
    expect(a.rawExtract).toContain("Repo: own/data");
    expect(a.rawExtract).toContain(`Commit: ${"a1".repeat(20)}`);
    expect(a.rawExtract).toContain("Message: Initial dump");
    expect(a.rawExtract).toContain(TIER_LINE);
    expect(a.rawExtract).toContain("line200");
    expect(a.rawExtract).not.toContain("line201");

    const huge = cands.find((c) => c.rawExtract.includes("Path: Huge.txt"))!;
    expect(huge.rawExtract).toContain("over max_inline_bytes");
    expect(huge.rawExtract).not.toContain("SHOULD NEVER BE FETCHED");

    const apiCalls = t.net.api();
    const contentCalls = apiCalls.filter((c) => c.url.includes("?ref="));
    expect(contentCalls).toHaveLength(3);
    expect(
      contentCalls.every(
        (c) => c.headers.accept === "application/vnd.github.raw+json",
      ),
    ).toBe(true);
    expect(apiCalls.some((c) => c.url.includes("Huge.txt?ref="))).toBe(false);
    // One directory listing per directory: tables/ and the root of each repo.
    expect(
      apiCalls.filter((c) => /\/contents\/?(tables)?$/.test(c.url)),
    ).toHaveLength(3);

    const row = t
      .rows()
      .find(
        (r) => r.url === "https://github.com/own/data/blob/HEAD/tables/a.tsv",
      )!;
    expect(row).toMatchObject({
      source: "github",
      title: "own/data: tables/a.tsv",
      contentHash: "a1".repeat(20),
      remoteModified: "2026-11-20T10:00:00.000Z",
    });
    expect(row.etag).toBe(`W/"${"a1".repeat(20)}"`);
  });

  it("sends the API headers and keeps 2 s between requests", async () => {
    const t = setup();
    seedFiles(t.net);
    await t.run();
    const calls = t.net.api();
    expect(
      calls.every((c) => c.headers["x-github-api-version"] === "2022-11-28"),
    ).toBe(true);
    expect(calls[0].headers.accept).toBe("application/vnd.github+json");
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(2000);
    }
  });

  it("a second run with 304s emits nothing and makes no compare or contents calls", async () => {
    const t = setup();
    seedFiles(t.net);
    await t.run();
    t.net.calls.length = 0;

    const stats = await t.run();
    expect(stats).toMatchObject({ new: 0, changed: 0, unchanged: 4 });
    expect(t.cands()).toHaveLength(4);
    const calls = t.net.api();
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.url.includes("/commits?"))).toBe(true);
    expect(
      calls.every((c) => c.headers["if-none-match"]?.startsWith('W/"')),
    ).toBe(true);
  });

  it("a changed sha costs one compare per repo and sha pair and emits a modified candidate with commits and +/- rows", async () => {
    const t = setup();
    seedFiles(t.net);
    await t.run();
    t.net.calls.length = 0;

    // Both tables moved in the same commit range; README did not.
    const next = "e2".repeat(20);
    for (const path of ["tables/a.tsv", "tables/b.tsv"]) {
      t.net.files[`own/data:${path}`] = {
        ...t.net.files[`own/data:${path}`],
        sha: next,
        date: "2026-11-25T09:00:00Z",
        message: "Add Mission m2 rows",
      };
    }
    t.net.compares[`own/data:${"a1".repeat(20)}...${next}`] = 404;
    t.net.compares[`own/data:${"b1".repeat(20)}...${next}`] = {
      commits: [
        {
          sha: "1".repeat(40),
          commit: {
            message: "First\n\nlong",
            committer: { date: "2026-11-24T00:00:00Z" },
          },
        },
        {
          sha: next,
          commit: {
            message: "Add Mission m2 rows",
            committer: { date: "2026-11-25T09:00:00Z" },
          },
        },
      ],
      files: [
        {
          filename: "tables/b.tsv",
          status: "modified",
          additions: 2,
          deletions: 1,
          patch:
            "@@ -1,3 +1,4 @@\n context\n-old row\n+Mission m2\t0x10\n+" +
            "x".repeat(300) +
            "\n+third",
        },
        {
          filename: "tables/other.tsv",
          status: "modified",
          additions: 99,
          deletions: 0,
        },
      ],
    };

    const stats = await t.run();
    expect(stats).toMatchObject({ new: 0, changed: 2 });
    const modified = t.cands().filter((c) => c.changeKind === "modified");
    expect(modified).toHaveLength(2);

    const b = modified.find((c) =>
      c.rawExtract.includes("Path: tables/b.tsv"),
    )!;
    expect(b.categoryHint).toBe("datamine");
    expect(b.rawExtract).toContain("Commits in range (2, repo-wide):");
    expect(b.rawExtract).toContain("First");
    expect(b.rawExtract).toContain("Change: modified, +2 / -1");
    expect(b.rawExtract).toContain("-old row");
    expect(b.rawExtract).toContain("+Mission m2\t0x10");
    expect(b.rawExtract).not.toContain("@@");
    expect(b.rawExtract).not.toContain("context");
    expect(b.missionHint).toBe("m2");
    const summary = JSON.parse(b.diffSummary!);
    expect(summary.lines).toEqual([
      "Commits: 2 (First; Add Mission m2 rows)",
      "+2 / -1",
    ]);
    expect(summary.snippets).toHaveLength(3);
    expect(summary.snippets[0]).toBe("Mission m2\t0x10");
    expect(summary.snippets[1]).toHaveLength(160);

    // a.tsv's old sha is unreachable: still reported, with the commit alone.
    const a = modified.find((c) =>
      c.rawExtract.includes("Path: tables/a.tsv"),
    )!;
    expect(a.rawExtract).toContain("Compare unavailable");

    const compareCalls = t.net.api().filter((c) => c.url.includes("/compare/"));
    expect(compareCalls).toHaveLength(2);
    expect(t.net.api().some((c) => c.url.includes("?ref="))).toBe(false);

    const row = t.rows().find((r) => r.url.endsWith("tables/b.tsv"))!;
    expect(row.contentHash).toBe(next);
  });

  it("shares one compare between paths that moved together, and falls back to counts when GitHub omits the patch", async () => {
    const t = setup();
    seedFiles(t.net);
    const shared = "a1".repeat(20);
    t.net.files["own/data:tables/b.tsv"].sha = shared;
    await t.run();

    const next = "f3".repeat(20);
    for (const path of ["tables/a.tsv", "tables/b.tsv"]) {
      t.net.files[`own/data:${path}`] = {
        ...t.net.files[`own/data:${path}`],
        sha: next,
      };
    }
    t.net.compares[`own/data:${shared}...${next}`] = {
      commits: [
        {
          sha: next,
          commit: {
            message: "Big change",
            committer: { date: "2026-11-25T09:00:00Z" },
          },
        },
      ],
      files: [
        // GitHub leaves `patch` out of a large diff.
        {
          filename: "tables/a.tsv",
          status: "modified",
          additions: 5000,
          deletions: 4000,
        },
        {
          filename: "tables/b.tsv",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: "@@ -1 +1,2 @@\n keep\n+new row",
        },
      ],
    };
    t.net.calls.length = 0;

    await t.run();
    expect(t.net.api().filter((c) => c.url.includes("/compare/"))).toHaveLength(
      1,
    );
    const byPath = (path: string) =>
      t
        .cands()
        .find(
          (c) =>
            c.changeKind === "modified" &&
            c.rawExtract.includes(`Path: ${path}`),
        )!;
    const a = byPath("tables/a.tsv");
    expect(a.rawExtract).toContain("Change: modified, +5000 / -4000");
    expect(a.rawExtract).toContain(
      "No patch: GitHub omits it for large diffs. Counts only.",
    );
    expect(JSON.parse(a.diffSummary!).snippets).toEqual([]);
    expect(byPath("tables/b.tsv").rawExtract).toContain("+new row");
  });
});

describe("rate budget", () => {
  it("stops calling below the reserve and leaves the rest for the next run", async () => {
    const t = setup();
    seedFiles(t.net);
    t.net.state.remaining = 8; // each paid request costs one; the reserve is 5

    const stats = await t.run();
    expect(t.net.api().length).toBeLessThanOrEqual(5);
    expect(stats.deferred).toBeGreaterThan(0);
    expect(t.logs.join("\n")).toMatch(/rate budget low \(4 left, reserve 5\)/);
    const done = t.cands().length;
    expect(done).toBeLessThan(4);

    // Budget restored: the deferred files come through and nothing is duplicated.
    t.net.state.remaining = 50;
    await t.run();
    expect(t.cands()).toHaveLength(4);
  });

  it("treats 403 with remaining 0 as rate limiting: logs the reset, stops, and is not a permanent block", async () => {
    const t = setup();
    seedFiles(t.net);
    t.net.state.remaining = 0;
    t.net.state.forceStatus = 403;

    const stats = await t.run();
    expect(t.net.api()).toHaveLength(1);
    expect(stats.deferred).toBe(3);
    expect(t.logs.join("\n")).toMatch(/rate limited until 2026-11-\d\dT/);

    // Not a permanent block: the next run (after the reset) carries on.
    t.net.state.remaining = 50;
    t.net.state.forceStatus = 0;
    await t.run();
    expect(t.cands()).toHaveLength(4);
  });
});

describe("discovery", () => {
  const search = (t: ReturnType<typeof setup>) =>
    t.net.api().filter((c) => c.url.includes("/search/repositories"));

  it("reports kept repos for review, drops the rest, and never re-reports a seen repo", async () => {
    // own/data is watched, so a search hit for it is not a new find.
    const t = setup({
      ...config,
      watch: [{ repo: "own/data", paths: ["x.tsv"] }],
    });
    t.net.setFile("own/data", "x.tsv");
    t.net.state.searchItems = [
      repoHit(),
      repoHit({
        full_name: "a/pc-port-data",
        name: "pc-port-data",
        html_url: "https://github.com/a/pc-port-data",
      }),
      repoHit({
        full_name: "a/gta6-downloader",
        name: "gta6-downloader",
        html_url: "https://github.com/a/gta6-downloader",
        description: "download strings",
      }),
      repoHit({
        full_name: "evil/gta6-data",
        name: "gta6-data",
        html_url: "https://github.com/evil/gta6-data",
      }),
      repoHit({
        full_name: "a/forked-data",
        name: "forked-data",
        html_url: "https://github.com/a/forked-data",
        fork: true,
      }),
      repoHit({
        full_name: "a/unrelated",
        name: "unrelated",
        html_url: "https://github.com/a/unrelated",
        description: "a fan site",
        topics: [],
      }),
      repoHit({
        full_name: "own/data",
        name: "data",
        html_url: "https://github.com/own/data",
      }),
    ];
    t.net.state.searchItems.push(
      repoHit({
        full_name: "t/x",
        name: "x",
        html_url: "https://github.com/t/x",
        description: null,
        topics: ["Datamine"],
      }),
    );

    const stats = await t.run();
    expect(stats.new).toBe(3);
    const cands = t
      .cands()
      .filter((c) => c.categoryHint === "datamine-discovery");
    expect(cands).toHaveLength(2);
    expect(cands.map((c) => c.categoryHint)).toEqual([
      "datamine-discovery",
      "datamine-discovery",
    ]);
    const first = cands[0].rawExtract;
    expect(first).toContain("Repo: someone/gta6-mission-data");
    expect(first).toContain("Stars: 12");
    expect(first).toContain("License: MIT");
    expect(first).toContain("Default branch: main");
    expect(first).toContain(TIER_LINE);
    expect(first).toContain(
      "Review only: not watched. Add to scrapers/config/github.yaml after review.",
    );

    const [call] = search(t);
    const q = new URL(call.url).searchParams;
    expect(q.get("q")).toBe('gta6 OR "gta vi" pushed:>2026-10-27');
    expect(q.get("sort")).toBe("updated");
    expect(q.get("per_page")).toBe("50");
    expect(t.rows().find((r) => r.url === SEARCH_URL)?.checkedAt).toEqual(NOW);

    // A later forced search sees the same hits: nothing new, and the window starts at the last search.
    t.net.calls.length = 0;
    const again = await t.run({
      forceDiscovery: ["github"],
      now: new Date(NOW.getTime() + DAY),
    });
    expect(again.new).toBe(0);
    expect(t.cands()).toHaveLength(3);
    expect(new URL(search(t)[0].url).searchParams.get("q")).toContain(
      "pushed:>2026-11-26",
    );
  });

  it("searches at most once per every_days unless forced", async () => {
    const t = setup({ ...config, watch: [] });
    await t.run();
    expect(search(t)).toHaveLength(1);

    await t.run({ now: new Date(NOW.getTime() + 6 * DAY) });
    expect(search(t)).toHaveLength(1);

    await t.run({ now: new Date(NOW.getTime() + 7 * DAY) });
    expect(search(t)).toHaveLength(2);

    await t.run({
      now: new Date(NOW.getTime() + 7 * DAY + 1000),
      forceDiscovery: ["github"],
    });
    expect(search(t)).toHaveLength(3);
  });

  it("does not advance the search time when the search fails", async () => {
    const t = setup({ ...config, watch: [] });
    t.net.state.searchStatus = 500;
    await t.run();
    expect(t.rows().find((r) => r.url === SEARCH_URL)).toBeUndefined();
  });
});

describe("what is ever requested", () => {
  it("only api.github.com, and never releases, archives, downloads or the watched file URLs", async () => {
    const t = setup();
    seedFiles(t.net);
    t.net.state.searchItems = [repoHit()];
    await t.run({ forceDiscovery: ["github"] });
    t.net.files["own/data:tables/a.tsv"].sha = "9".repeat(40);
    await t.run();

    const urls = t.net.calls.map((c) => c.url);
    expect(urls.length).toBeGreaterThan(5);
    expect(urls.every((u) => new URL(u).host === "api.github.com")).toBe(true);
    expect(
      urls.some((u) =>
        /releases|zipball|tarball|archive|download|blob\/HEAD/.test(u),
      ),
    ).toBe(false);
  });
});

describe("registry entry", () => {
  it("is the real module: api host, 2 s spacing, tier note, switchable", () => {
    expect(github).toMatchObject({
      id: "github",
      enabled: true,
      hosts: ["api.github.com"],
      minIntervalMs: 2000,
      reportNote: TIER_LINE,
    });
  });
});

describe("command line", () => {
  it("--github-search forces the weekly search, and the report shows the tier line under the source heading", async () => {
    const net = fakeGithub();
    seedFiles(net);
    const dir = mkdtempSync(path.join(tmpdir(), "leonida-github-"));
    tmpDirs.push(dir);
    const env = { DATABASE_PATH: dbs.fresh(), SCRAPE_REPORT_DIR: dir };
    const cli = (...argv: string[]) =>
      runCli(["--source", "github", "--since", "2026-11-20", ...argv], env, {
        curated,
        modules: [makeGithubSource(() => config)],
        fetchDeps: { ...net.deps, defaultIntervalMs: 0 },
        now: () => NOW,
        log: () => {},
      });
    const searches = () =>
      net.api().filter((c) => c.url.includes("/search/repositories")).length;

    expect(await cli()).toBe(0);
    expect(searches()).toBe(1);
    expect(await cli()).toBe(0);
    expect(searches()).toBe(1);
    expect(await cli("--github-search")).toBe(0);
    expect(searches()).toBe(2);

    const report = readFileSync(path.join(dir, "latest.md"), "utf8");
    expect(report).toContain(`### github\n\n${TIER_LINE}`);
    expect(report).toContain("own/data: tables/a.tsv");
    expect(report).toContain("First seen at a1a1a1a");
  });
});
