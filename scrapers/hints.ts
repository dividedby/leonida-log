import type { CuratedData } from "../lib/curated";

export interface Hints {
  /** Curated mission slugs (main and optional) whose titles the page names. */
  missionSlugs: string[];
  /** Slug of the first gate at or after the latest main mission named. */
  gateHint: string | null;
}

const MIN_TITLE_LENGTH = 5;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a matcher once per run; mission titles are matched case-insensitively on word boundaries. */
export function createHinter(curated: CuratedData) {
  const entries = [
    ...curated.missions.map((m) => ({
      slug: m.slug,
      title: m.title,
      order: m.order,
    })),
    ...curated.optionalMissions.map((m) => ({
      slug: m.slug,
      title: m.title,
      order: null,
    })),
  ]
    .filter((m) => m.title.length >= MIN_TITLE_LENGTH)
    .map((m) => ({
      ...m,
      re: new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegex(m.title)}(?![\\p{L}\\p{N}])`,
        "iu",
      ),
    }));

  return function hints(title: string, text: string): Hints {
    const haystack = `${title}\n${text}`;
    const found = entries.filter((e) => e.re.test(haystack));
    const latestMain = Math.max(
      0,
      ...found.flatMap((e) => (e.order === null ? [] : [e.order])),
    );
    const gate =
      latestMain > 0
        ? curated.gates.find((g) => g.order >= latestMain)
        : undefined;
    return {
      missionSlugs: found.map((e) => e.slug),
      gateHint: gate?.mission ?? null,
    };
  };
}
