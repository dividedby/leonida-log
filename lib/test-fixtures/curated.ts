import { parseCurated, type CuratedData } from "../curated";

type Obj = Record<string, unknown>;

/** Loosely typed so tests can delete or corrupt fields. */
export interface FixtureRaw {
  missions: { chapters: Obj[]; missions: Obj[] };
  gates: { gates: Obj[] };
  areas: { areas: Obj[] };
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

function optional(
  slug: string,
  chapter: string,
  opensAfter: string,
  closesAt: string,
  extra: Obj = {},
): Obj {
  return {
    slug,
    title: `Optional ${slug}`,
    chapter,
    kind: "optional",
    character: "jason",
    opens_after: opensAfter,
    closes_at: closesAt,
    sources: [source],
    ...extra,
  };
}

function area(
  slug: string,
  name: string,
  visibleAfter: string,
  extra: Obj = {},
): Obj {
  return {
    slug,
    name,
    visible_after_mission: visibleAfter,
    sources: [source],
    ...extra,
  };
}

/**
 * Valid raw curated input: 2 chapters, 8 main missions (m1-m4, m5-m8), gates
 * at m3 and m7, and 4 optionals listed after the mains: o1 (opens m1, closes
 * m3), o2 (opens o1, closes m3), o3 (opens m2, closes m7), o4 (opens m5,
 * never closes). Areas: r1 "Region One" (visible m1, alias "the Region"), r2
"Region Two" (m5) and district d1 "District One" under r2 (m6); none is
placed on an item or optional. A fresh copy per call so tests can mutate it freely.
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
        optional("o1", "first-chapter", "m1", "m3"),
        optional("o2", "first-chapter", "o1", "m3"),
        optional("o3", "first-chapter", "m2", "m7"),
        optional("o4", "second-chapter", "m5", "never"),
      ],
    },
    gates: {
      gates: [
        { mission: "m3", lost: ["Thing one"], sources: [source] },
        { mission: "m7", lost: ["Thing two"], sources: [source] },
      ],
    },
    areas: {
      areas: [
        area("r1", "Region One", "m1", { aliases: ["the Region"] }),
        area("r2", "Region Two", "m5"),
        area("d1", "District One", "m6", { parent: "r2" }),
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
