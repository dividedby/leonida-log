import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureData } from "../lib/test-fixtures/curated";
import { openDatabase } from "../lib/db/open";
import { candidates, sources } from "../lib/db/schema";
import { tempDbs } from "../lib/db/test-helpers";
import { runCli } from "./main";
import { renderReport } from "./report";
import { runScrape } from "./run";
import { createPoliteFetcher } from "./fetch/politeFetch";
import { fakeNetwork } from "./test-helpers";
import type { ReportRow } from "./store";
import type { SourceModule } from "./types";

const dbs = tempDbs();
const curated = fixtureData();
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const row = (over: Partial<ReportRow>): ReportRow => ({
  candidateId: 1,
  source: "alpha",
  url: "https://alpha.test/p",
  title: "A page",
  remoteModified: "2026-11-25T00:00:00.000Z",
  changeKind: "new",
  gateHint: null,
  missionHint: null,
  diffSummary: null,
  createdAt: new Date("2026-11-25T10:00:00Z"),
  ...over,
});

describe("renderReport", () => {
  it("groups by gate hint then source, with counts, mission labels and snippets", () => {
    const md = renderReport({
      curated,
      since: "2026-11-20",
      generatedAt: new Date("2026-11-26T12:00:00Z"),
      rows: [
        row({ title: "No gate page", url: "https://alpha.test/n" }),
        row({
          source: "beta",
          title: "Gated page",
          url: "https://beta.test/g",
          gateHint: "m7",
          missionHint: "m5,o4",
          changeKind: "modified",
          diffSummary: JSON.stringify({
            headingsAdded: ["Fresh heading"],
            headingsRemoved: ["Old heading"],
            paragraphsAdded: 2,
            paragraphsRemoved: 1,
            snippets: ["Added   line one"],
          }),
        }),
        row({
          source: "alpha",
          title: "Early gate",
          url: "https://alpha.test/e",
          gateHint: "m3",
        }),
      ],
      stats: [
        {
          id: "alpha",
          name: "Alpha",
          discovered: 9,
          fetched: 4,
          unchanged: 3,
          changed: 0,
          new: 2,
          baselined: 1,
          deferred: 5,
          blockedByRobots: 2,
          errors: 1,
          discoveryError: null,
        },
      ],
    });

    expect(md).toContain("# Changed since 2026-11-20");
    expect(md).toContain("| Alpha | 9 | 4 | 3 | 0 | 2 | 1 | 5 | 2 | 1 |");
    // Gates in story order, then rows with no gate hint.
    expect(md.indexOf("## Before Mission m3 (#3)")).toBeLessThan(
      md.indexOf("## Before Mission m7 (#7)"),
    );
    expect(md.indexOf("## Before Mission m7 (#7)")).toBeLessThan(
      md.indexOf("## No gate hint"),
    );
    expect(md).toContain("Missions: Mission m5 (#5), Optional o4 (optional)");
    expect(md).toContain("Headings added: Fresh heading");
    expect(md).toContain("Headings removed: Old heading");
    expect(md).toContain("Paragraphs: +2 / -1");
    expect(md).toContain("> Added line one");
    expect(md).toContain("(modified)");
  });
});

describe("--report-only", () => {
  it("regenerates the report from the database without any network", async () => {
    const file = dbs.fresh();
    const opened = openDatabase(file);
    const mod: SourceModule = {
      id: "fake",
      name: "Fake",
      enabled: true,
      hosts: ["guide.test"],
      method: "sitemap",
      discover: async () => [
        {
          url: "https://guide.test/a",
          body: "<main><h1>Report Page</h1><p>Mission m2 is next.</p></main>",
        },
      ],
    };
    const net = fakeNetwork({});
    await runScrape({
      db: opened.db,
      curated,
      modules: [mod],
      fetcher: createPoliteFetcher({ ...net.deps, defaultIntervalMs: 0 }),
      now: () => new Date("2026-11-25T10:00:00Z"),
    });
    opened.close();

    const reportDir = mkdtempSync(path.join(tmpdir(), "leonida-report-"));
    dirs.push(reportDir);
    const failing = fakeNetwork({}, undefined);
    const lines: string[] = [];
    const code = await runCli(
      ["--report-only", "--since", "2026-11-20"],
      { DATABASE_PATH: file, SCRAPE_REPORT_DIR: reportDir },
      {
        curated,
        now: () => new Date("2026-11-26T12:00:00Z"),
        fetchDeps: failing.deps,
        log: (m) => lines.push(m),
      },
    );

    expect(code).toBe(0);
    expect(failing.calls).toHaveLength(0);
    const dated = readFileSync(
      path.join(reportDir, "changed-since-2026-11-20.md"),
      "utf8",
    );
    expect(dated).toContain("Report Page");
    expect(dated).toContain("## Before Mission m3 (#3)");
    expect(readFileSync(path.join(reportDir, "latest.md"), "utf8")).toBe(dated);
  });

  it("refuses a database that was never migrated", async () => {
    const lines: string[] = [];
    const code = await runCli(
      ["--report-only"],
      { DATABASE_PATH: dbs.empty() },
      {
        curated,
        log: (m) => lines.push(m),
      },
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/pnpm db:migrate/);
  });
});

describe("cli arguments", () => {
  it.each([
    [["--since", "yesterday"], /YYYY-MM-DD/],
    [["--source", "nope"], /Unknown source/],
    [["--bogus"], /Usage/],
  ])("rejects %j", async (argv, message) => {
    const lines: string[] = [];
    const dir = mkdtempSync(path.join(tmpdir(), "leonida-report-"));
    dirs.push(dir);
    const code = await runCli(
      argv,
      { DATABASE_PATH: path.join(dir, "x.db") },
      {
        curated,
        log: (m) => lines.push(m),
      },
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(message);
    expect(existsSync(path.join(dir, "x.db"))).toBe(false);
  });
});

describe("--purge", () => {
  it("deletes one source's pages and candidates, including an id no longer in the registry, and runs nothing else", async () => {
    const file = dbs.fresh();
    const opened = openDatabase(file);
    const modFor = (id: string): SourceModule => ({
      id,
      name: id,
      enabled: true,
      hosts: ["guide.test"],
      method: "sitemap",
      discover: async () => [
        {
          url: `https://guide.test/${id}`,
          body: `<main><h1>${id}</h1><p>Text for ${id}.</p></main>`,
        },
      ],
    });
    const net = fakeNetwork({});
    await runScrape({
      db: opened.db,
      curated,
      modules: [modFor("gone"), modFor("kept")],
      fetcher: createPoliteFetcher({ ...net.deps, defaultIntervalMs: 0 }),
    });
    opened.close();

    const lines: string[] = [];
    const reportDir = mkdtempSync(path.join(tmpdir(), "leonida-report-"));
    dirs.push(reportDir);
    const code = await runCli(
      ["--purge", "gone"],
      { DATABASE_PATH: file, SCRAPE_REPORT_DIR: reportDir },
      {
        curated,
        fetchDeps: net.deps,
        log: (m) => lines.push(m),
      },
    );

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain(
      "purged gone: 1 page(s), 1 candidate(s) deleted",
    );
    expect(existsSync(path.join(reportDir, "latest.md"))).toBe(false);
    const after = openDatabase(file);
    expect(
      after.db
        .select()
        .from(sources)
        .all()
        .map((r) => r.source),
    ).toEqual(["kept"]);
    expect(after.db.select().from(candidates).all()).toHaveLength(1);
    after.close();
  });
});
