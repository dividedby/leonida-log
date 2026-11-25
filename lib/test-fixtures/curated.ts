import { parseCurated, type CuratedData } from "../curated";

type Obj = Record<string, unknown>;

/** Loosely typed so tests can delete or corrupt fields. */
export interface FixtureRaw {
  missions: { chapters: Obj[]; missions: Obj[] };
  gates: { gates: Obj[] };
  itemFiles: Record<string, { items: Obj[] }>;
}

const source = {
  url: "https://example.com/guide",
  title: "Example guide",
  accessed: "2026-11-25",
};

function item(
  id: string,
  gate: string,
  visibleAfter: string,
  extra: Obj = {},
): Obj {
  return {
    id,
    title: `Item ${id}`,
    category: "General",
    before_gate: gate,
    visible_after_mission: visibleAfter,
    verified: true,
    how_to: "Do the thing.",
    location: "Somewhere.",
    sources: [source],
    ...extra,
  };
}

/**
 * Valid raw curated input: 2 chapters, 8 missions (m1-m4, m5-m8), gates at m3
 * and m7. A fresh copy per call so tests can mutate it freely.
 */
export function fixtureRaw(): FixtureRaw {
  return {
    missions: {
      chapters: [
        { slug: "first-chapter", title: "First Chapter" },
        { slug: "second-chapter", title: "Second Chapter" },
      ],
      missions: [
        ...["m1", "m2", "m3", "m4"].map((slug) => ({
          slug,
          title: `Mission ${slug}`,
          chapter: "first-chapter",
        })),
        ...["m5", "m6", "m7", "m8"].map((slug) => ({
          slug,
          title: `Mission ${slug}`,
          chapter: "second-chapter",
        })),
      ],
    },
    gates: {
      gates: [
        { mission: "m3", lost: ["Thing one"], sources: [source] },
        { mission: "m7", lost: ["Thing two"], sources: [source] },
      ],
    },
    itemFiles: {
      m3: {
        items: [
          item("a", "m3", "m1"),
          item("b", "m3", "m2", { lost_at_mission: "m3" }),
          item("c", "m3", "m3"),
        ],
      },
      m7: {
        items: [item("d", "m7", "m5"), item("e", "m7", "m7")],
      },
    },
  };
}

export function fixtureData(): CuratedData {
  return parseCurated(fixtureRaw());
}
