import { eq } from "drizzle-orm";
import type { CuratedData } from "../curated";
import type { Db } from "./open";
import {
  CHARACTERS,
  MAX_STAT_LEVEL,
  SPOILER_MODES,
  STATS,
  THEMES,
  itemChecks,
  progress,
  statLevels,
  type Character,
  type SpoilerMode,
  type Stat,
  type Theme,
} from "./schema";

/** A mission or item slug that curated data doesn't contain. */
export class UnknownRefError extends Error {
  constructor(kind: "mission" | "item", slug: string) {
    super(`Unknown ${kind}: ${slug}`);
    this.name = "UnknownRefError";
  }
}

/** A value outside an enum or range the schema allows. */
export class InvalidValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidValueError";
  }
}

export interface Progress {
  currentMission: string | null;
  spoilerMode: SpoilerMode;
  theme: Theme;
}

export interface StatLevel {
  character: Character;
  stat: Stat;
  level: number;
}

function oneOf<T extends string>(
  label: string,
  allowed: readonly T[],
  value: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new InvalidValueError(`Invalid ${label}: ${value}`);
  }
  return value as T;
}

/**
 * The app's data access. Mission and item slugs are checked against curated
 * data before anything is written (curated ids have no FK). The clock is an
 * optional argument, never read at module level.
 */
export function createRepository(db: Db, curated: CuratedData) {
  const missionSlugs = new Set(curated.missions.map((m) => m.slug));
  // Optional missions are derived checklist rows, ticked like items.
  const itemIds = new Set([
    ...curated.items.map((i) => i.id),
    ...curated.optionalMissions.map((o) => o.slug),
  ]);

  function upsertProgress(
    patch: Partial<Progress>,
    now: Date = new Date(),
  ): void {
    db.insert(progress)
      .values({ id: 1, ...patch, updatedAt: now })
      .onConflictDoUpdate({
        target: progress.id,
        set: { ...patch, updatedAt: now },
      })
      .run();
  }

  return {
    getProgress(): Progress {
      const row = db.select().from(progress).where(eq(progress.id, 1)).get();
      return {
        currentMission: row?.currentMission ?? null,
        spoilerMode: row?.spoilerMode ?? "safe",
        theme: row?.theme ?? "system",
      };
    },

    setCurrentMission(slug: string, now?: Date): void {
      if (!missionSlugs.has(slug)) throw new UnknownRefError("mission", slug);
      upsertProgress({ currentMission: slug }, now);
    },

    setSpoilerMode(mode: SpoilerMode, now?: Date): void {
      upsertProgress(
        { spoilerMode: oneOf("spoiler mode", SPOILER_MODES, mode) },
        now,
      );
    },

    setTheme(theme: Theme, now?: Date): void {
      upsertProgress({ theme: oneOf("theme", THEMES, theme) }, now);
    },

    checkedItemIds(): Set<string> {
      return new Set(
        db
          .select({ id: itemChecks.itemId })
          .from(itemChecks)
          .all()
          .map((r) => r.id),
      );
    },

    /** Flips the check and returns the new state. */
    toggleItem(itemId: string, now: Date = new Date()): boolean {
      if (!itemIds.has(itemId)) throw new UnknownRefError("item", itemId);
      return db.transaction((tx) => {
        const removed = tx
          .delete(itemChecks)
          .where(eq(itemChecks.itemId, itemId))
          .returning()
          .all();
        if (removed.length > 0) return false;
        tx.insert(itemChecks).values({ itemId, checkedAt: now }).run();
        return true;
      });
    },

    /** Idempotent, so a repeated or out-of-order form submit can't flip the state. */
    setItemChecked(
      itemId: string,
      checked: boolean,
      now: Date = new Date(),
    ): void {
      if (!itemIds.has(itemId)) throw new UnknownRefError("item", itemId);
      if (checked) {
        db.insert(itemChecks)
          .values({ itemId, checkedAt: now })
          .onConflictDoNothing()
          .run();
      } else {
        db.delete(itemChecks).where(eq(itemChecks.itemId, itemId)).run();
      }
    },

    getStatLevels(): StatLevel[] {
      return db
        .select({
          character: statLevels.character,
          stat: statLevels.stat,
          level: statLevels.level,
        })
        .from(statLevels)
        .all();
    },

    setStatLevel(
      character: Character,
      stat: Stat,
      level: number,
      now: Date = new Date(),
    ): void {
      oneOf("character", CHARACTERS, character);
      oneOf("stat", STATS, stat);
      if (!Number.isInteger(level) || level < 0 || level > MAX_STAT_LEVEL) {
        throw new InvalidValueError(
          `Invalid stat level: ${level} (0-${MAX_STAT_LEVEL})`,
        );
      }
      db.insert(statLevels)
        .values({ character, stat, level, updatedAt: now })
        .onConflictDoUpdate({
          target: [statLevels.character, statLevels.stat],
          set: { level, updatedAt: now },
        })
        .run();
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
