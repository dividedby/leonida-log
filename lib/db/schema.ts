import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { MAX_STAT_LEVEL } from "../stat-level";

export { MAX_STAT_LEVEL };

/** Enums live here once; CHECK constraints and TypeScript types derive from them. */
export const CHARACTERS = ["jason", "lucia"] as const;
export const STATS = ["strength", "cardio", "focus"] as const;
export const SPOILER_MODES = ["safe", "open"] as const;
export const THEMES = ["system", "light", "dark"] as const;
export const CANDIDATE_STATUSES = ["new", "promoted", "rejected"] as const;
export const CHANGE_KINDS = ["new", "modified"] as const;

export type Character = (typeof CHARACTERS)[number];
export type Stat = (typeof STATS)[number];
export type SpoilerMode = (typeof SPOILER_MODES)[number];
export type Theme = (typeof THEMES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** SQL list literal for a CHECK ... IN (...) clause. Values are code constants. */
function inList(values: readonly string[]): ReturnType<typeof sql.raw> {
  return sql.raw(values.map((v) => `'${v}'`).join(", "));
}

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

// Curated ids (mission and item slugs) are plain text with no foreign key:
// curated data lives in YAML, not the DB. lib/db/repository.ts validates them.

/** Single row (id = 1). Absent until first written; the mission is null until onboarding. */
export const progress = sqliteTable(
  "progress",
  {
    id: integer("id").primaryKey(),
    currentMission: text("current_mission"),
    spoilerMode: text("spoiler_mode", { enum: SPOILER_MODES })
      .notNull()
      .default("safe"),
    theme: text("theme", { enum: THEMES }).notNull().default("system"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    check("progress_single_row", sql`${t.id} = 1`),
    check(
      "progress_spoiler_mode",
      sql`${t.spoilerMode} in (${inList(SPOILER_MODES)})`,
    ),
    check("progress_theme", sql`${t.theme} in (${inList(THEMES)})`),
  ],
);

export const itemChecks = sqliteTable("item_checks", {
  itemId: text("item_id").primaryKey(),
  checkedAt: timestamp("checked_at").notNull(),
});

export const statLevels = sqliteTable(
  "stat_levels",
  {
    character: text("character", { enum: CHARACTERS }).notNull(),
    stat: text("stat", { enum: STATS }).notNull(),
    level: integer("level").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.character, t.stat] }),
    check(
      "stat_levels_character",
      sql`${t.character} in (${inList(CHARACTERS)})`,
    ),
    check("stat_levels_stat", sql`${t.stat} in (${inList(STATS)})`),
    check(
      "stat_levels_level",
      sql`${t.level} between 0 and ${sql.raw(String(MAX_STAT_LEVEL))}`,
    ),
  ],
);

/** Workout log. Unused since ADR 0009 dropped it; kept until a later contract migration. */
export const workouts = sqliteTable(
  "workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    character: text("character", { enum: CHARACTERS }).notNull(),
    stat: text("stat", { enum: STATS }).notNull(),
    at: timestamp("at").notNull(),
  },
  (t) => [
    index("workouts_character_stat_at").on(t.character, t.stat, t.at),
    check("workouts_character", sql`${t.character} in (${inList(CHARACTERS)})`),
    check("workouts_stat", sql`${t.stat} in (${inList(STATS)})`),
  ],
);

/** A page a scraper tracks. Server only; never committed or rendered. */
export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Scraper module id (scrapers/sources/<id>.ts).
    source: text("source").notNull().default(""),
    url: text("url").notNull().unique(),
    title: text("title"),
    host: text("host").notNull(),
    // HTTP validators from the last 200, sent back for conditional GETs.
    etag: text("etag"),
    lastModified: text("last_modified"),
    // ISO UTC from the source's own listing (WP modified_gmt, sitemap lastmod, JSON-LD dateModified).
    remoteModified: text("remote_modified"),
    // sha256 of the normalized extract; null for baseline rows never fetched.
    contentHash: text("content_hash"),
    httpStatus: integer("http_status"),
    // Last successful 200.
    fetchedAt: timestamp("fetched_at").notNull(),
    checkedAt: timestamp("checked_at"),
    // Null until first content; moves only when the content hash changes.
    changedAt: timestamp("changed_at"),
    // Latest normalized extract, kept to diff the next version. Never rendered:
    // guide pages mix in later spoilers.
    extract: text("extract"),
  },
  (t) => [index("sources_source").on(t.source)],
);

/** A scraped fact awaiting review. Scrapers own this table; the repository does not touch it yet. */
export const candidates = sqliteTable(
  "candidates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    // Free-text hints, not validated against curated data.
    gateHint: text("gate_hint"),
    categoryHint: text("category_hint"),
    // Comma-separated curated mission slugs named in the page.
    missionHint: text("mission_hint"),
    changeKind: text("change_kind", { enum: CHANGE_KINDS }),
    contentHash: text("content_hash"),
    // JSON: headings and paragraphs added/removed since the previous extract.
    diffSummary: text("diff_summary"),
    // Raw scraped text. Never rendered: guide pages mix in later spoilers.
    rawExtract: text("raw_extract").notNull(),
    status: text("status", { enum: CANDIDATE_STATUSES })
      .notNull()
      .default("new"),
    createdAt: timestamp("created_at").notNull(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (t) => [
    index("candidates_status").on(t.status),
    check(
      "candidates_status_values",
      sql`${t.status} in (${inList(CANDIDATE_STATUSES)})`,
    ),
    check(
      "candidates_change_kind_values",
      sql`${t.changeKind} is null or ${t.changeKind} in (${inList(CHANGE_KINDS)})`,
    ),
  ],
);
