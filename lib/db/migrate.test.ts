import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrateScript, tempDbs } from "./test-helpers";

const dbs = tempDbs();

const APP_TABLES = [
  "candidates",
  "item_checks",
  "progress",
  "sources",
  "stat_levels",
  "workouts",
];

function tableNames(file: string): string[] {
  const sqlite = new Database(file, { readonly: true });
  try {
    return sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '\\_\\_%' escape '\\' order by name",
      )
      .all()
      .map((r) => (r as { name: string }).name);
  } finally {
    sqlite.close();
  }
}

// Spawns `node scripts/migrate.mjs`; the default 5 s timeout flakes when the suite runs in parallel.
describe("db:migrate script", { timeout: 30_000 }, () => {
  it("builds every table from an empty path and is a no-op when re-run", () => {
    const file = dbs.empty();

    runMigrateScript(file);
    expect(tableNames(file)).toEqual(APP_TABLES);

    const sqlite = new Database(file);
    sqlite.exec(
      "insert into item_checks (item_id, checked_at) values ('keep-me', 1)",
    );
    expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    sqlite.close();

    runMigrateScript(file);
    expect(tableNames(file)).toEqual(APP_TABLES);
    const after = new Database(file, { readonly: true });
    expect(after.prepare("select item_id from item_checks").all()).toEqual([
      { item_id: "keep-me" },
    ]);
    after.close();
  });

  it("fails without DATABASE_PATH", () => {
    expect(() => runMigrateScript()).toThrow();
  });
});
