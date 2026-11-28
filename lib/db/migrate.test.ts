import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runMigrateScript, tempDbs } from "./test-helpers";

const dbs = tempDbs();

const APP_TABLES = [
  "candidates",
  "item_checks",
  "progress",
  "sources",
  "stat_levels",
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

  it("upgrades a database from before the workouts drop, keeping its other data", () => {
    const folder = mkdtempSync(join(tmpdir(), "leonida-migrations-"));
    const file = dbs.empty();
    try {
      // Migrations as of release 0.1.0: everything before 0002_drop_workouts.
      cpSync(fileURLToPath(new URL("../../drizzle", import.meta.url)), folder, {
        recursive: true,
      });
      const journalPath = join(folder, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8"));
      journal.entries = journal.entries.filter(
        (e: { tag: string }) => e.tag < "0002",
      );
      writeFileSync(journalPath, JSON.stringify(journal));

      const old = new Database(file);
      migrate(drizzle(old), { migrationsFolder: folder });
      old.exec(
        "insert into workouts (character, stat, at) values ('jason', 'strength', 1);" +
          "insert into item_checks (item_id, checked_at) values ('keep-me', 1);" +
          "insert into stat_levels (character, stat, level, updated_at) values ('lucia', 'focus', 3, 1)",
      );
      old.close();
      expect(tableNames(file)).toContain("workouts");

      runMigrateScript(file);

      expect(tableNames(file)).toEqual(APP_TABLES);
      const after = new Database(file, { readonly: true });
      expect(after.prepare("select item_id from item_checks").all()).toEqual([
        { item_id: "keep-me" },
      ]);
      expect(
        after.prepare("select character, stat, level from stat_levels").all(),
      ).toEqual([{ character: "lucia", stat: "focus", level: 3 }]);
      after.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("fails without DATABASE_PATH", () => {
    expect(() => runMigrateScript()).toThrow();
  });
});
