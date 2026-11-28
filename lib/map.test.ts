import { describe, expect, it } from "vitest";
import { checklistView } from "./checklist";
import { loadCurated } from "./curated-load";
import type { CuratedData } from "./curated";
import { isAreaVisible, nextGate } from "./gates";
import { areaSheet, mapView } from "./map";
import { placedData } from "./test-fixtures/placed";

const data = placedData();
const real = loadCurated();

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const sheetIds = (sheet: ReturnType<typeof areaSheet>) =>
  (sheet?.sections ?? []).flatMap((s) => ids(s.rows));
const none = new Set<string>();

function sheetOf(
  current: string,
  slug: string,
  checks: Set<string> = none,
  curated: CuratedData = data,
) {
  const sheet = areaSheet(curated, current, checks, slug);
  if (!sheet) throw new Error(`no sheet ${slug} at ${current}`);
  return sheet;
}

function regionAt(current: string, index: number, checks = none) {
  const region = mapView(data, current, checks).regions[index];
  if (!region) throw new Error(`no region ${index}`);
  return region;
}

/** Every checklist row the map is built on: all but "No longer available". */
function checklistRows(
  curated: CuratedData,
  current: string,
  checks: Set<string>,
) {
  return checklistView(curated, current, checks)
    .sections.filter((s) => s.key !== "gone")
    .flatMap((s) => s.rows);
}

const allIds = new Set([
  ...data.items.map((i) => i.id),
  ...data.optionalMissions.map((o) => o.slug),
]);
const mainSlugs = data.missions.map((m) => m.slug);

// Placed fixture (lib/test-fixtures/placed.ts): areas r1 (m1), r2 (m5) and its
// district d1 (m6). a, b, c, o1 in r1; d, o4 in r2; e in d1; o2, o3 unplaced.
describe("mapView regions", () => {
  it("names and links a reached region and leaves an unreached one as an index", () => {
    const view = mapView(data, "m1", none);
    expect(view.regions).toEqual([
      {
        reached: true,
        index: 0,
        name: "Region One",
        href: "/map/r1",
        badge: 2,
      },
      { reached: false, index: 1 },
    ]);
  });

  it("reaches a region at its visible_after_mission", () => {
    expect(regionAt("m4", 1)).toEqual({ reached: false, index: 1 });
    expect(regionAt("m5", 1)).toMatchObject({
      reached: true,
      name: "Region Two",
      href: "/map/r2",
    });
  });

  it("lists regions only; a district rolls up into its region", () => {
    for (const current of mainSlugs) {
      expect(mapView(data, current, none).regions.map((r) => r.index)).toEqual([
        0, 1,
      ]);
    }
  });

  it("gives an unreached region no name, slug, href or alias anywhere in the view", () => {
    const json = JSON.stringify(mapView(data, "m1", none));
    for (const text of ["Region Two", "r2", "d1", "District One", "/map/r2"]) {
      expect(json).not.toContain(text);
    }
    expect(Object.keys(regionAt("m1", 1)).sort()).toEqual(["index", "reached"]);
  });

  it("keeps one index space for reached and unreached regions", () => {
    // index is the position among top-level areas in areas.yaml: the schematic
    // draws region i with shape i whether or not it is reached.
    const topLevel = data.areas.filter((a) => a.parent === undefined);
    expect(topLevel.map((a) => a.slug)).toEqual(["r1", "r2"]);
    const reached = mapView(data, "m8", none).regions;
    expect(reached.map((r) => (r.reached ? r.name : null))).toEqual(
      topLevel.map((a) => a.name),
    );
  });
});

describe("mapView header", () => {
  it.each([
    { current: "m1", eyebrow: "Before Mission m3" },
    { current: "m3", eyebrow: "Before Mission m3" },
    { current: "m4", eyebrow: "Before Mission m7" },
  ])("names the next gate at $current", ({ current, eyebrow }) => {
    expect(mapView(data, current, none).header).toEqual({
      eyebrow,
      title: "Map",
    });
  });

  it("has no eyebrow after the last gate", () => {
    const header = mapView(data, "m8", none).header;
    expect(header).toEqual({ title: "Map" });
    expect("eyebrow" in header).toBe(false);
  });
});

describe("mapView badges", () => {
  it("counts the unticked rows of the region's sheet", () => {
    expect(regionAt("m1", 0)).toMatchObject({ badge: 2 });
    expect(regionAt("m1", 0, new Set(["a"]))).toMatchObject({ badge: 1 });
    expect(regionAt("m1", 0, new Set(["a", "o1"]))).toMatchObject({ badge: 0 });
  });

  it("matches the sheet's own left count", () => {
    for (const current of mainSlugs) {
      for (const checks of [none, new Set(["a", "d", "o4"]), allIds]) {
        for (const region of mapView(data, current, checks).regions) {
          if (!region.reached) continue;
          const slug = region.href.replace("/map/", "");
          expect(region.badge).toBe(sheetOf(current, slug, checks).header.left);
        }
      }
    }
  });

  it("leaves a closed unticked row out, and a ticked closed row on the sheet but out of the badge", () => {
    // b closes at m3, so at m3 it can't be done
    expect(sheetIds(areaSheet(data, "m3", none, "r1"))).toEqual(["a", "c"]);
    expect(regionAt("m3", 0)).toMatchObject({ badge: 2 });
    const ticked = new Set(["b"]);
    expect(sheetIds(areaSheet(data, "m3", ticked, "r1"))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(regionAt("m3", 0, ticked)).toMatchObject({ badge: 2 });
  });

  it("rolls a district's rows up into its region", () => {
    // at m7: d, o4 in r2 and e in d1
    expect(regionAt("m7", 1)).toMatchObject({ badge: 3 });
    expect(regionAt("m7", 1, new Set(["e"]))).toMatchObject({ badge: 2 });
  });
});

describe("mapView anywhere", () => {
  it("holds the rows with no area, counted like a checklist section", () => {
    const anywhere = mapView(data, "m1", new Set(["o2"])).anywhere;
    expect(anywhere).toMatchObject({
      key: "anywhere",
      title: "Anywhere",
      done: 1,
      total: 1,
    });
    expect(ids(anywhere!.rows)).toEqual(["o2"]);
  });

  it("is null when every row is placed", () => {
    expect(mapView(data, "m5", none).anywhere).not.toBeNull();
    expect(mapView(data, "m8", none).anywhere).toBeNull();
  });

  it("leaves closed unticked rows out and keeps unplaced safe-to-leave rows", () => {
    // o2 and o1 close at m3; o3 closes at m7
    expect(mapView(data, "m3", none).anywhere).toBeNull();
    expect(ids(mapView(data, "m4", none).anywhere!.rows)).toEqual(["o3"]);
    expect(mapView(data, "m7", none).anywhere).toBeNull();
  });
});

describe("mapView rows", () => {
  it("are the checklist's own rows", () => {
    for (const current of mainSlugs) {
      const view = mapView(data, current, new Set(["a", "o4"]));
      const sheets = view.regions.flatMap((r) =>
        r.reached
          ? sheetOf(current, r.href.replace("/map/", ""), new Set(["a", "o4"]))
              .sections
          : [],
      );
      const rows = [
        ...sheets,
        ...(view.anywhere ? [view.anywhere] : []),
      ].flatMap((s) => s.rows);
      const byId = new Map(
        checklistRows(data, current, new Set(["a", "o4"])).map((r) => [
          r.id,
          r,
        ]),
      );
      for (const row of rows) expect(row).toEqual(byId.get(row.id));
    }
  });

  it("partitions the checklist's rows: each in Anywhere or one region's sheet", () => {
    for (const current of mainSlugs) {
      for (const checks of [none, new Set(["a", "d", "o1"]), allIds]) {
        const view = mapView(data, current, checks);
        const placed = view.regions.flatMap((r) =>
          r.reached
            ? sheetIds(
                areaSheet(data, current, checks, r.href.replace("/map/", "")),
              )
            : [],
        );
        const listed = [...placed, ...ids(view.anywhere?.rows ?? [])];
        const expected = checklistRows(data, current, checks);
        expect(listed.sort(), `${current}`).toEqual(ids(expected).sort());

        const left = view.regions.reduce(
          (n, r) => n + (r.reached ? r.badge : 0),
          0,
        );
        const anywhereLeft = (view.anywhere?.rows ?? []).filter(
          (r) => !r.checked,
        ).length;
        expect(left + anywhereLeft, `${current} badges`).toBe(
          expected.filter((r) => !r.checked).length,
        );
      }
    }
  });

  it("after the last gate are the safe-to-leave optionals only", () => {
    const view = mapView(data, "m8", none);
    expect(view.regions[1]).toMatchObject({ reached: true, badge: 1 });
    expect(sheetIds(areaSheet(data, "m8", none, "r2"))).toEqual(["o4"]);
    expect(sheetIds(areaSheet(data, "m8", none, "r1"))).toEqual([]);
  });
});

describe("areaSheet", () => {
  it("groups like the checklist: categories, optional missions, safe to leave", () => {
    const sheet = sheetOf("m5", "r2");
    expect(sheet.sections.map((s) => [s.key, s.title, ids(s.rows)])).toEqual([
      ["category-General", "General", ["d"]],
      ["safe", "Safe to leave", ["o4"]],
    ]);
    const r1 = sheetOf("m2", "r1");
    expect(r1.sections.map((s) => [s.title, ids(s.rows)])).toEqual([
      ["General", ["a", "b"]],
      ["Optional missions", ["o1"]],
    ]);
  });

  it("recomputes each section's and the header's counts for the area", () => {
    const sheet = sheetOf("m2", "r1", new Set(["a", "o2"]));
    expect(sheet.sections.map((s) => [s.title, s.done, s.total])).toEqual([
      ["General", 1, 2],
      ["Optional missions", 0, 1],
    ]);
    expect(sheet.header).toEqual({
      name: "Region One",
      left: 2,
      done: 1,
      total: 3,
      subtitle: "2 to do here",
    });
  });

  it.each([
    {
      name: "something left",
      checks: new Set<string>(),
      subtitle: "2 to do here",
    },
    {
      name: "everything ticked",
      checks: new Set(["a", "c", "o1"]),
      subtitle: "All done here",
    },
  ])("words the header subtitle for $name", ({ checks, subtitle }) => {
    expect(sheetOf("m3", "r1", checks).header.subtitle).toBe(subtitle);
  });

  it("says nothing is here yet for an area with no rows", () => {
    expect(sheetOf("m6", "d1").header.subtitle).toBe("Nothing here yet");
  });

  it("includes a region's districts and a district only its own rows", () => {
    expect(sheetIds(areaSheet(data, "m7", none, "r2")).sort()).toEqual([
      "d",
      "e",
      "o4",
    ]);
    expect(sheetIds(areaSheet(data, "m7", none, "d1"))).toEqual(["e"]);
  });

  it("is empty but present for a reached area with no rows", () => {
    expect(sheetOf("m6", "d1")).toEqual({
      header: {
        name: "District One",
        left: 0,
        done: 0,
        total: 0,
        subtitle: "Nothing here yet",
      },
      sections: [],
    });
  });

  it.each([
    { name: "an unknown slug", current: "m8", slug: "nope" },
    { name: "an unreached region", current: "m1", slug: "r2" },
    { name: "a district before its region", current: "m4", slug: "d1" },
    { name: "a district before it is visible", current: "m5", slug: "d1" },
  ])("is null for $name", ({ current, slug }) => {
    expect(areaSheet(data, current, none, slug)).toBeNull();
  });

  it("is present for a visible district", () => {
    expect(areaSheet(data, "m6", none, "d1")).not.toBeNull();
  });

  it("throws on an unknown or optional current mission", () => {
    expect(() => mapView(data, "nope", none)).toThrow(/nope/);
    expect(() => areaSheet(data, "o1", none, "r1")).toThrow(/o1/);
  });
});

const key = /lock|hidden/i;

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  }
  return [];
}

/** Every leak the map's view models could carry, for one mission as current. */
function leaks(curated: CuratedData, current: string, checks: Set<string>) {
  const mission = curated.missions.find((m) => m.slug === current)!;
  const views = [
    mapView(curated, current, checks),
    ...curated.areas.map((a) => areaSheet(curated, current, checks, a.slug)),
  ];
  const found: string[] = [];
  const gate = nextGate(curated, current);
  const reachedChapter =
    curated.chapters.find((c) => c.slug === mission.chapter)?.order ?? 0;
  for (const view of views) {
    const json = JSON.stringify(view);
    const has = (text: string) => json.includes(text);
    for (const k of keysOf(view)) {
      if (key.test(k)) found.push(`${current}: key ${k}`);
    }
    for (const a of curated.areas) {
      if (isAreaVisible(curated, a, current)) continue;
      const names = [
        a.name,
        ...(a.aliases ?? []),
        `"${a.slug}"`,
        `/map/${a.slug}`,
      ];
      for (const text of names) {
        if (has(text)) found.push(`${current}: area ${a.slug} as ${text}`);
      }
    }
    for (const m of curated.missions) {
      if (m.order <= mission.order || m.slug === gate?.mission) continue;
      if (has(m.title) || has(`"${m.slug}"`)) {
        found.push(`${current}: mission ${m.slug}`);
      }
    }
    for (const o of curated.optionalMissions) {
      if (o.opensOrder <= mission.order) continue;
      if (has(o.title) || has(`"${o.slug}"`)) {
        found.push(`${current}: optional ${o.slug}`);
      }
    }
    for (const c of curated.chapters) {
      if (c.order > reachedChapter && has(c.title)) {
        found.push(`${current}: chapter ${c.slug}`);
      }
    }
    for (const item of curated.items) {
      const visible =
        (curated.missions.find((m) => m.slug === item.visible_after_mission)
          ?.order ?? Infinity) <= mission.order;
      if (visible) continue;
      if (has(item.title) || has(`"${item.id}"`)) {
        found.push(`${current}: item ${item.id}`);
      }
    }
  }
  return found;
}

const tickSets = (curated: CuratedData) => [
  { name: "nothing ticked", checks: new Set<string>() },
  {
    name: "everything ticked",
    checks: new Set([
      ...curated.items.map((i) => i.id),
      ...curated.optionalMissions.map((o) => o.slug),
    ]),
  },
];

describe.each([
  { name: "fixture with later areas", curated: data },
  { name: "real data", curated: real },
])("map view models leaks ($name)", ({ curated }) => {
  it.each(tickSets(curated))(
    "name nothing past the current mission and carry no locked count ($name)",
    ({ checks }) => {
      const found = curated.missions.flatMap((m) =>
        leaks(curated, m.slug, checks),
      );
      expect(found).toEqual([]);
    },
  );

  it("give no sheet to an area that isn't visible", () => {
    for (const mission of curated.missions) {
      for (const a of curated.areas) {
        const sheet = areaSheet(curated, mission.slug, none, a.slug);
        const open =
          isAreaVisible(curated, a, mission.slug) &&
          (a.parent === undefined ||
            isAreaVisible(
              curated,
              curated.areas.find((p) => p.slug === a.parent)!,
              mission.slug,
            ));
        expect(sheet !== null, `${a.slug} at ${mission.slug}`).toBe(open);
      }
    }
  });

  it("show every region by index and name only the reached ones", () => {
    for (const mission of curated.missions) {
      const view = mapView(curated, mission.slug, none);
      const top = curated.areas.filter((a) => a.parent === undefined);
      expect(view.regions.map((r) => r.index)).toEqual(top.map((_, i) => i));
      view.regions.forEach((r, i) => {
        expect(r.reached, `${top[i].slug} at ${mission.slug}`).toBe(
          isAreaVisible(curated, top[i], mission.slug),
        );
      });
    }
  });
});
