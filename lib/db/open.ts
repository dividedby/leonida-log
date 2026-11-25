import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export interface OpenedDatabase {
  db: Db;
  sqlite: Database.Database;
  close(): void;
}

/**
 * Opens the database file with the app's pragmas. Never migrates: the
 * schema comes from `pnpm db:migrate` (scripts/migrate.mjs), which sets the
 * same journal mode. No `server-only` here so tests can import it; app code
 * goes through client.ts.
 */
export function openDatabase(file: string): OpenedDatabase {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    close: () => sqlite.close(),
  };
}
