// Applies the committed SQL in ../drizzle to the database at DATABASE_PATH.
// Plain Node, no tsx. Run explicitly (`pnpm db:migrate`); deploy runs it
// before starting the app. The app and the scraper never migrate.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const file = process.env.DATABASE_PATH;
if (!file) {
  console.error("DATABASE_PATH is not set");
  process.exit(1);
}

mkdirSync(dirname(file), { recursive: true });
const sqlite = new Database(file);
try {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log(`Migrated ${file}`);
} finally {
  sqlite.close();
}
