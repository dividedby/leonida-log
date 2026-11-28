import { CHARACTERS, STATS, type Character, type Stat } from "./db/schema";
import type { StatLevel } from "./db/repository";
import { MAX_STAT_LEVEL } from "./stat-level";

/** View model for Stats, and the write-side parser for its level forms. */

const CHARACTER_NAMES: Record<Character, string> = {
  jason: "Jason",
  lucia: "Lucia",
};
const STAT_LABELS: Record<Stat, string> = {
  strength: "Strength",
  cardio: "Cardio",
  focus: "Focus",
};

export interface StatCard {
  character: Character;
  name: string;
  stats: {
    stat: Stat;
    label: string;
    level: number;
    /** Every level the picker offers, the current one flagged. */
    options: { level: number; current: boolean }[];
  }[];
}

/** Both characters, all three stats; a stat with no row yet is level 0. */
export function statsView(levels: StatLevel[]): StatCard[] {
  return CHARACTERS.map((character) => ({
    character,
    name: CHARACTER_NAMES[character],
    stats: STATS.map((stat) => {
      const level =
        levels.find((l) => l.character === character && l.stat === stat)
          ?.level ?? 0;
      return {
        stat,
        label: STAT_LABELS[stat],
        level,
        options: Array.from({ length: MAX_STAT_LEVEL + 1 }, (_, n) => ({
          level: n,
          current: n === level,
        })),
      };
    }),
  }));
}

const LEVEL = /^[0-4]$/;

/**
 * The FormData the picker's buttons submit: `character`, `stat` and the
 * target `level` (a level, not a delta, so a double tap can't drift). Null
 * unless all three are exactly valid.
 */
export function parseStatLevelInput(
  formData: FormData,
): { character: Character; stat: Stat; level: number } | null {
  const character = formData.get("character");
  const stat = formData.get("stat");
  const level = formData.get("level");
  if (
    typeof character !== "string" ||
    typeof stat !== "string" ||
    typeof level !== "string"
  ) {
    return null;
  }
  const knownCharacter = CHARACTERS.find((c) => c === character);
  const knownStat = STATS.find((s) => s === stat);
  if (!knownCharacter || !knownStat || !LEVEL.test(level)) return null;
  return { character: knownCharacter, stat: knownStat, level: Number(level) };
}
