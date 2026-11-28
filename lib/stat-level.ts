/** Client-safe: no DB imports, so components and lib/db/schema.ts can both use it. */
export const MAX_STAT_LEVEL = 4;

/** Whole level in 0..MAX_STAT_LEVEL; NaN and non-finite values become 0. */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(MAX_STAT_LEVEL, Math.max(0, Math.round(level)));
}

/** Filled arc length of a stat ring with the given circumference. */
export function ringDash(level: number, circumference: number): number {
  return (circumference * clampLevel(level)) / MAX_STAT_LEVEL;
}
