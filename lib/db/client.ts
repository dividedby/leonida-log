import "server-only";
import { openDatabase, type Db, type OpenedDatabase } from "./open";

// Survives Next dev HMR, which re-evaluates modules and would leak connections.
const globalForDb = globalThis as { __leonidaDb?: OpenedDatabase };

/**
 * Lazy singleton for app code. The schema must already exist: migrations run
 * through `pnpm db:migrate`, never here.
 */
export function getDb(): Db {
  if (!globalForDb.__leonidaDb) {
    const file = process.env.DATABASE_PATH;
    if (!file) throw new Error("DATABASE_PATH is not set");
    const opened = openDatabase(file);
    const migrated = opened.sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
      )
      .get();
    if (!migrated) {
      opened.close();
      throw new Error(
        `Database at ${file} has no schema; run pnpm db:migrate first`,
      );
    }
    globalForDb.__leonidaDb = opened;
  }
  return globalForDb.__leonidaDb.db;
}
