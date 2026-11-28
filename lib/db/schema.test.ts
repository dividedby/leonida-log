import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type OpenedDatabase } from "./open";
import { candidates, sources } from "./schema";
import { tempDbs } from "./test-helpers";

const dbs = tempDbs();

let opened: OpenedDatabase | undefined;
afterEach(() => {
  opened?.close();
  opened = undefined;
});

function open(): OpenedDatabase {
  opened = openDatabase(dbs.fresh());
  return opened;
}

describe("connection settings", () => {
  it("uses WAL and enforces foreign keys", () => {
    const { sqlite } = open();
    expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});

describe("constraints reject bad rows", () => {
  it.each([
    [
      "progress_single_row",
      "insert into progress (id, updated_at) values (2, 0)",
    ],
    [
      "progress_spoiler_mode",
      "insert into progress (id, spoiler_mode, updated_at) values (1, 'everything', 0)",
    ],
    [
      "progress_theme",
      "insert into progress (id, theme, updated_at) values (1, 'sepia', 0)",
    ],
    [
      "stat_levels_level",
      "insert into stat_levels (character, stat, level, updated_at) values ('jason', 'strength', 5, 0)",
    ],
    [
      "stat_levels_level",
      "insert into stat_levels (character, stat, level, updated_at) values ('jason', 'strength', -1, 0)",
    ],
    [
      "candidates_status_values",
      "insert into sources (id, url, host, fetched_at) values (1, 'https://a.test/x', 'a.test', 0); insert into candidates (source_id, raw_extract, status, created_at) values (1, 'x', 'maybe', 0)",
    ],
    [
      "candidates_change_kind_values",
      "insert into sources (id, url, host, fetched_at) values (1, 'https://a.test/x', 'a.test', 0); insert into candidates (source_id, raw_extract, change_kind, created_at) values (1, 'x', 'deleted', 0)",
    ],
  ])("%s", (constraint, sql) => {
    const { sqlite } = open();
    expect(() => sqlite.exec(sql)).toThrow(
      `CHECK constraint failed: ${constraint}`,
    );
  });
});

describe("candidates", () => {
  it("need an existing source and are removed with it", () => {
    const { db } = open();
    const now = new Date(1_000);

    expect(() =>
      db
        .insert(candidates)
        .values({ sourceId: 99, rawExtract: "x", createdAt: now })
        .run(),
    ).toThrow(/foreign key/i);

    const source = db
      .insert(sources)
      .values({ url: "https://a.test/x", host: "a.test", fetchedAt: now })
      .returning()
      .get();
    db.insert(candidates)
      .values({ sourceId: source.id, rawExtract: "x", createdAt: now })
      .run();
    expect(db.select().from(candidates).all()).toHaveLength(1);
    expect(db.select().from(candidates).get()?.status).toBe("new");

    db.delete(sources).where(eq(sources.id, source.id)).run();
    expect(db.select().from(candidates).all()).toHaveLength(0);
  });
});
