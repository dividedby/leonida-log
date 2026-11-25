import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll } from "vitest";

const MIGRATE_SCRIPT = fileURLToPath(
  new URL("../../scripts/migrate.mjs", import.meta.url),
);

/** Runs the real `db:migrate` script with DATABASE_PATH set to `file` (or unset). */
export function runMigrateScript(file?: string): void {
  const env = { ...process.env };
  delete env.DATABASE_PATH;
  if (file !== undefined) env.DATABASE_PATH = file;
  execFileSync(process.execPath, [MIGRATE_SCRIPT], { env, stdio: "pipe" });
}

/**
 * Temp-file databases for integration tests. Migrates once per test file via
 * the real script, then hands out a fresh copy per call; all removed after
 * each test. Call at describe or module level.
 */
export function tempDbs(): { fresh(): string; empty(): string } {
  let dir: string;
  let template: string;
  const dirs: string[] = [];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "leonida-db-template-"));
    template = join(dir, "template.db");
    runMigrateScript(template);
    return () => rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function newDir(): string {
    const d = mkdtempSync(join(tmpdir(), "leonida-db-"));
    dirs.push(d);
    return d;
  }

  return {
    /** Path to a migrated database. */
    fresh() {
      const file = join(newDir(), "test.db");
      copyFileSync(template, file);
      return file;
    },
    /** Path where no database exists yet. */
    empty() {
      return join(newDir(), "test.db");
    },
  };
}
