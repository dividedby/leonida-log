import { defineConfig } from "drizzle-kit";

// Only `pnpm db:generate` uses this (writes SQL to ./drizzle). Applying
// migrations is scripts/migrate.mjs (`pnpm db:migrate`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
