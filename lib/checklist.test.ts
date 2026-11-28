import { describe, expect, it } from "vitest";
import { checklistView, itemDetail } from "./checklist";
import { parseCurated, type CuratedData } from "./curated";
import { loadCurated } from "./curated-load";
import { nextGate } from "./gates";
import { fixtureData, fixtureRaw } from "./test-fixtures/curated";

const data = fixtureData();
const real = loadCurated();

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-");

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

/** Section titles with their row ids, for readable expectations. */
function layout(view: ReturnType<typeof checklistView>) {
  return view.sections.map((s) => [s.title, ids(s.rows)]);
}

function section(view: ReturnType<typeof checklistView>, title: string) {
  const found = view.sections.find((s) => s.title === title);
  if (!found) throw new Error(`no section ${title}`);
  return found;
}

// Fixture: gate m3 has items a (visible m1), b (m2, lost m3), c (m3) and
// optionals o1, o2 (open m1, close m3); gate m7 has d (m5), e (m7) and o3
// (opens m2, closes m7); o4 opens m5 and never closes. All items are General.
describe("checklistView header", () => {
  it("names the next gate and counts its rows", () => {
    expect(checklistView(data, "m1", new Set(["a", "o1"])).header).toEqual({
      eyebrow: "Before you move on",
      title: "Mission m3",
      subtitle: "2 of 3 done",
    });
  });

  it("counts closed rows in the total and in done when ticked", () => {
    expect(checklistView(data, "m3", new Set()).header.subtitle).toBe(
      "0 of 3 done",
    );
    expect(checklistView(data, "m3", new Set(["b"])).header.subtitle).toBe(
      "1 of 3 done",
    );
  });

  it("after the last gate has no gate and no count", () => {
    expect(checklistView(data, "m8", new Set()).header).toEqual({
      title: "Before you move on",
      subtitle: "No more points of no return.",
    });
  });
});

describe("checklistView sections", () => {
  it("groups items by category, then optional missions", () => {
    const view = checklistView(data, "m1", new Set());
    expect(layout(view)).toEqual([
      ["General", ["a"]],
      ["Optional missions", ["o1", "o2"]],
    ]);
  });

  it("orders categories as the curated list does and skips empty ones", () => {
    const raw = fixtureRaw();
    const items = raw.itemFiles.m3.items;
    items[0].category = "Money";
    items[1].category = "Stats";
    items[2].category = "Vehicles";
    items[2].visible_after_mission = "m1";
    const view = checklistView(parseCurated(raw), "m2", new Set());
    expect(layout(view)).toEqual([
      ["Stats", ["b"]],
      ["Vehicles", ["c"]],
      ["Money", ["a"]],
      ["Optional missions", ["o1", "o2"]],
    ]);
  });

  it("counts done and total per section", () => {
    const view = checklistView(data, "m2", new Set(["a", "o2"]));
    expect(view.sections.map((s) => [s.title, s.done, s.total])).toEqual([
      ["General", 1, 2],
      ["Optional missions", 1, 2],
    ]);
  });

  it("lists optional missions most urgent first", () => {
    const raw = fixtureRaw();
    // o2 now closes one mission before o1
    raw.missions.missions.find((m) => m.slug === "o2")!.closes_at = "m2";
    const view = checklistView(parseCurated(raw), "m1", new Set());
    expect(ids(section(view, "Optional missions").rows)).toEqual(["o2", "o1"]);
  });

  it("keeps ticked rows listed and checked, without chips", () => {
    const view = checklistView(data, "m2", new Set(["b", "o1"]));
    const rows = view.sections.flatMap((s) => s.rows);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.b).toMatchObject({ checked: true, chips: [] });
    expect(byId.o1).toMatchObject({ checked: true, chips: [] });
    expect(byId.a).toMatchObject({ checked: false });
    expect(byId.o2.chips.length).toBeGreaterThan(0);
  });

  it("links every row to its detail route", () => {
    const view = checklistView(data, "m1", new Set());
    expect(view.sections.flatMap((s) => s.rows).map((r) => r.href)).toEqual([
      "/checklist/item/a",
      "/checklist/item/o1",
      "/checklist/item/o2",
    ]);
  });

  describe("past a cutoff", () => {
    it("moves an unticked closed row to 'No longer available', disabled and unchipped", () => {
      const view = checklistView(data, "m3", new Set());
      expect(layout(view)).toEqual([
        ["General", ["a", "c"]],
        ["No longer available", ["b"]],
      ]);
      expect(section(view, "No longer available").rows[0]).toMatchObject({
        checked: false,
        disabled: true,
        chips: [],
      });
    });

    it("leaves a ticked closed row in its category, enabled so it can be unticked", () => {
      const view = checklistView(data, "m3", new Set(["b"]));
      expect(layout(view)).toEqual([["General", ["a", "b", "c"]]]);
      expect(view.sections[0].rows[1]).toMatchObject({
        id: "b",
        checked: true,
        disabled: false,
      });
      expect(view.sections[0]).toMatchObject({ done: 1, total: 3 });
    });

    it("keeps closed rows out of the category counts", () => {
      const view = checklistView(data, "m3", new Set());
      expect(section(view, "General")).toMatchObject({ done: 0, total: 2 });
    });

    it("does not disable open rows", () => {
      const rows = checklistView(data, "m2", new Set()).sections.flatMap(
        (s) => s.rows,
      );
      expect(rows.every((r) => !r.disabled)).toBe(true);
    });
  });

  describe("safe to leave", () => {
    it.each([
      { current: "m4", expected: [] },
      { current: "m5", expected: ["o4"] },
      { current: "m8", expected: ["o4"] },
    ])("at $current lists $expected", ({ current, expected }) => {
      const view = checklistView(data, current, new Set());
      const titles = view.sections.map((s) => s.title);
      expect(titles.includes("Safe to leave")).toBe(expected.length > 0);
      if (expected.length > 0) {
        expect(ids(section(view, "Safe to leave").rows)).toEqual(expected);
      }
    });

    it("lists a ticked row checked and counts it", () => {
      const view = checklistView(data, "m8", new Set(["o4"]));
      expect(view.sections).toHaveLength(1);
      expect(view.sections[0]).toMatchObject({
        title: "Safe to leave",
        done: 1,
        total: 1,
      });
      expect(view.sections[0].rows[0]).toMatchObject({
        checked: true,
        chips: [],
      });
    });

    it("stays out of the gate's count", () => {
      expect(checklistView(data, "m5", new Set(["o4"])).header.subtitle).toBe(
        "0 of 2 done",
      );
    });
  });
});

describe("checklistView chips", () => {
  // Item a closes at m7 (gate m7 is the only gate: m3 is dropped), visible m1.
  function singleGate(): CuratedData {
    const raw = fixtureRaw();
    raw.gates.gates = raw.gates.gates.filter((g) => g.mission === "m7");
    const items = Object.values(raw.itemFiles).flatMap((f) => f.items);
    for (const item of items) item.before_gate = "m7";
    items[0].lost_at_mission = "m7";
    raw.itemFiles = { m7: { items } };
    return parseCurated(raw);
  }

  it.each([
    { current: "m3", missions: 4, soon: false },
    { current: "m4", missions: 3, soon: true },
    { current: "m6", missions: 1, soon: true },
  ])(
    "an item closing in $missions shows 'Soon lost' $soon",
    ({ current, soon }) => {
      const view = checklistView(singleGate(), current, new Set());
      const a = view.sections.flatMap((s) => s.rows).find((r) => r.id === "a");
      expect(a?.chips.some((c) => c.variant === "soon-lost")).toBe(soon);
      expect(a?.chips.some((c) => c.variant === "countdown")).toBe(true);
    },
  );

  it("shows no chip for a row that never closes", () => {
    const rows = checklistView(data, "m5", new Set()).sections.flatMap(
      (s) => s.rows,
    );
    expect(rows.find((r) => r.id === "o4")?.chips).toEqual([]);
  });
});

describe("checklistView locked", () => {
  it("counts what is still hidden and names the unlock mission", () => {
    expect(checklistView(data, "m1", new Set()).locked).toEqual({
      count: 2,
      unlockTitle: "Mission m2",
    });
  });

  it.each([
    { name: "nothing is hidden", current: "m3" },
    { name: "after the last gate", current: "m8" },
  ])("is null when $name", ({ current }) => {
    expect(checklistView(data, current, new Set()).locked).toBeNull();
  });
});

describe("checklistView lost list", () => {
  it("shows the gate's lost entries with a countdown while the gate is ahead", () => {
    expect(checklistView(data, "m1", new Set()).lost).toEqual({
      label: "Closes in 2 missions",
      entries: ["Thing one"],
    });
    expect(checklistView(data, "m2", new Set()).lost?.label).toBe(
      "Do this before your next story mission",
    );
  });

  it.each([
    { name: "standing on the gate", current: "m3" },
    { name: "after the last gate", current: "m8" },
  ])("is hidden when $name", ({ current }) => {
    expect(checklistView(data, current, new Set()).lost).toBeNull();
  });
});

describe("checklistView errors", () => {
  it("throws on an unknown or optional current mission", () => {
    expect(() => checklistView(data, "nope", new Set())).toThrow(/nope/);
    expect(() => checklistView(data, "o1", new Set())).toThrow(/o1/);
  });
});

describe("checklistView leaks (real data)", () => {
  const mains = real.missions;
  const everyId = new Set([
    ...real.items.map((i) => i.id),
    ...real.optionalMissions.map((o) => o.slug),
  ]);

  it.each([
    { name: "nothing ticked", checked: new Set<string>() },
    { name: "everything ticked", checked: everyId },
  ])(
    "names no later main mission but the next gate and the unlock mission ($name)",
    ({ checked }) => {
      for (const current of mains) {
        const view = checklistView(real, current.slug, checked);
        const json = JSON.stringify(view);
        const allowed = new Set<string>();
        const gate = nextGate(real, current.slug);
        if (gate) allowed.add(gate.mission);
        for (const m of mains) {
          if (m.title === view.locked?.unlockTitle) allowed.add(m.slug);
        }
        for (const m of mains) {
          if (m.order <= current.order || allowed.has(m.slug)) continue;
          expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(
            m.title,
          );
          expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(
            `"${m.slug}"`,
          );
        }
      }
    },
  );

  it("names no unopened optional mission and no unreached chapter", () => {
    for (const current of mains) {
      const json = JSON.stringify(checklistView(real, current.slug, new Set()));
      for (const o of real.optionalMissions) {
        if (o.opensOrder <= current.order) continue;
        expect(json, `${current.slug} leaks ${o.slug}`).not.toContain(o.title);
        expect(json, `${current.slug} leaks ${o.slug}`).not.toContain(
          `/checklist/item/${o.slug}"`,
        );
      }
      const reached =
        real.chapters.find((c) => c.slug === current.chapter)?.order ?? 0;
      for (const c of real.chapters.filter((c) => c.order > reached)) {
        expect(json, `${current.slug} leaks ${c.slug}`).not.toContain(c.title);
      }
    }
  });

  it("never lists a hidden item", () => {
    for (const current of mains) {
      const view = checklistView(real, current.slug, new Set());
      const listed = new Set(
        view.sections.flatMap((s) => s.rows).map((r) => r.id),
      );
      for (const item of real.items) {
        const visible =
          (real.missions.find((m) => m.slug === item.visible_after_mission)
            ?.order ?? Infinity) <= current.order;
        if (!visible) expect(listed.has(item.id)).toBe(false);
      }
    }
  });
});

describe("itemDetail", () => {
  it("returns a visible item's curated text and sources", () => {
    expect(itemDetail(data, "a", "m1")).toEqual({
      kind: "item",
      title: "Item a",
      category: "General",
      howTo: "Do the thing.",
      location: "Somewhere.",
      sources: [{ title: "Example guide", url: "https://example.com/guide" }],
      closes: { state: "never" },
    });
  });

  it("carries the item's countdown", () => {
    expect(itemDetail(data, "b", "m2")).toMatchObject({
      closes: { state: "open", missions: 1 },
    });
    expect(itemDetail(data, "b", "m3")).toMatchObject({
      closes: { state: "closed" },
    });
  });

  it("omits location when the item has none", () => {
    const raw = fixtureRaw();
    delete raw.itemFiles.m3.items[0].location;
    const detail = itemDetail(parseCurated(raw), "a", "m1");
    expect(detail).not.toBeNull();
    expect("location" in detail!).toBe(false);
  });

  it("returns an opened optional mission with its note and character", () => {
    const raw = fixtureRaw();
    raw.missions.missions.find((m) => m.slug === "o1")!.note = "A note.";
    expect(itemDetail(parseCurated(raw), "o1", "m1")).toEqual({
      kind: "optional",
      title: "Optional o1",
      note: "A note.",
      character: "jason",
      sources: [{ title: "Example guide", url: "https://example.com/guide" }],
      closes: { state: "open", missions: 2 },
    });
  });

  it("omits the note when the optional has none", () => {
    const detail = itemDetail(data, "o4", "m5");
    expect(detail).toMatchObject({
      kind: "optional",
      closes: { state: "never" },
    });
    expect("note" in detail!).toBe(false);
  });

  it.each([
    { name: "a hidden item", id: "b", current: "m1" },
    { name: "an unopened optional", id: "o4", current: "m4" },
    { name: "an unknown id", id: "nope", current: "m8" },
  ])("is null for $name", ({ id, current }) => {
    expect(itemDetail(data, id, current)).toBeNull();
  });

  it("never carries research background", () => {
    const raw = fixtureRaw();
    raw.itemFiles.m3.items[0].evidence = {
      basis: "best-guess",
      note: "secret",
    };
    const json = JSON.stringify(itemDetail(parseCurated(raw), "a", "m1"));
    expect(json).not.toMatch(/evidence|verified|secret|accessed/);
  });
});

describe("itemDetail sources", () => {
  // Source titles and links are curated from outside and can name a mission
  // the item's own text may not, so a source that does is withheld.
  function withSources(sources: { title: string; url: string }[]) {
    const raw = fixtureRaw();
    raw.itemFiles.m3.items[0].sources = sources.map((s) => ({
      ...s,
      accessed: "2026-11-25",
    }));
    return parseCurated(raw);
  }
  const clean = { title: "Plain guide", url: "https://example.com/a" };

  it.each([
    {
      name: "title",
      source: {
        title: "Walkthrough: Mission m5",
        url: "https://example.com/x",
      },
    },
    {
      name: "link",
      source: { title: "A guide", url: "https://example.com/mission-m5-guide" },
    },
    {
      name: "link in another case and separator",
      source: { title: "A guide", url: "https://example.com/MISSION_M5" },
    },
  ])("withholds a source whose $name names a later mission", ({ source }) => {
    const curated = withSources([clean, source]);
    expect(itemDetail(curated, "a", "m1")).toMatchObject({ sources: [clean] });
    expect(itemDetail(curated, "a", "m5")).toMatchObject({
      sources: [clean, source],
    });
  });

  it("withholds a source whose link carries a later mission's slug, not its title", () => {
    const raw = fixtureRaw();
    // like "Clonin' Keys, Makin' Gs", whose slug spells another title
    raw.missions.missions.find((m) => m.slug === "m5")!.title = "Another Name";
    raw.itemFiles.m3.items[0].sources = [
      {
        title: "A guide",
        url: "https://example.com/guides/m5-walkthrough",
        accessed: "2026-11-25",
      },
    ];
    const curated = parseCurated(raw);
    expect(itemDetail(curated, "a", "m1")).toMatchObject({ sources: [] });
    expect(itemDetail(curated, "a", "m5")).toMatchObject({
      sources: [{ title: "A guide" }],
    });
  });

  // o4 opens at m5 and is "Optional o4": naming it earlier shows it exists.
  it.each([
    {
      name: "title",
      source: {
        title: "Walkthrough: Optional o4",
        url: "https://example.com/x",
      },
    },
    {
      name: "slug in the link",
      source: { title: "A guide", url: "https://example.com/guides/o4-run" },
    },
  ])(
    "withholds a source whose $name names an unopened optional",
    ({ source }) => {
      const curated = withSources([clean, source]);
      expect(itemDetail(curated, "a", "m1")).toMatchObject({
        sources: [clean],
      });
      expect(itemDetail(curated, "a", "m4")).toMatchObject({
        sources: [clean],
      });
      expect(itemDetail(curated, "a", "m5")).toMatchObject({
        sources: [clean, source],
      });
    },
  );

  it("applies the same rule on an optional mission's own detail, which may name itself", () => {
    const raw = fixtureRaw();
    const o3 = raw.missions.missions.find((m) => m.slug === "o3")!;
    const other = { title: "Optional o4 guide", url: "https://example.com/y" };
    const own = { title: "Optional o3 guide", url: "https://example.com/z" };
    o3.sources = [other, own].map((s) => ({ ...s, accessed: "2026-11-25" }));
    const curated = parseCurated(raw);
    expect(itemDetail(curated, "o3", "m2")).toMatchObject({ sources: [own] });
    expect(itemDetail(curated, "o3", "m5")).toMatchObject({
      sources: [other, own],
    });
  });

  it("keeps a source that names the item's own gate", () => {
    const own = { title: "Mission m3 guide", url: "https://example.com/m3" };
    expect(itemDetail(withSources([own]), "a", "m1")).toMatchObject({
      sources: [own],
    });
  });

  it("can end up with no sources", () => {
    const only = { title: "Mission m6 notes", url: "https://example.com/y" };
    expect(itemDetail(withSources([only]), "a", "m1")).toMatchObject({
      sources: [],
    });
  });
});

describe("itemDetail leaks (real data)", () => {
  const mains = real.missions;

  it("exists only for visible items and opened optional missions", () => {
    for (const current of mains) {
      for (const item of real.items) {
        const visible =
          (real.missions.find((m) => m.slug === item.visible_after_mission)
            ?.order ?? Infinity) <= current.order;
        expect(
          itemDetail(real, item.id, current.slug) !== null,
          `${item.id} at ${current.slug}`,
        ).toBe(visible);
      }
      for (const o of real.optionalMissions) {
        expect(
          itemDetail(real, o.slug, current.slug) !== null,
          `${o.slug} at ${current.slug}`,
        ).toBe(o.opensOrder <= current.order);
      }
    }
  });

  it("names no later main mission but the entry's own gate", () => {
    const entries = [
      ...real.items.map((i) => ({ id: i.id, gate: i.before_gate })),
      ...real.optionalMissions.map((o) => ({
        id: o.slug,
        gate:
          o.closesOrder === null
            ? null
            : (real.gates.find((g) => g.order >= o.closesOrder!)?.mission ??
              null),
      })),
    ];
    const titles = mains.map((m) => ({ ...m, slugged: slugify(m.title) }));
    const leaks: string[] = [];
    for (const current of mains) {
      const unopened = real.optionalMissions.filter(
        (o) => o.opensOrder > current.order,
      );
      const reached =
        real.chapters.find((c) => c.slug === current.chapter)?.order ?? 0;
      const unreached = real.chapters.filter((c) => c.order > reached);
      for (const { id, gate } of entries) {
        const detail = itemDetail(real, id, current.slug);
        if (detail === null) continue;
        const json = JSON.stringify(detail);
        const slugged = slugify(json);
        for (const o of unopened) {
          if (json.includes(o.title) || json.includes(`"${o.slug}"`)) {
            leaks.push(`${id} at ${current.slug} leaks optional ${o.slug}`);
          }
        }
        for (const c of unreached) {
          if (json.includes(c.title)) {
            leaks.push(`${id} at ${current.slug} leaks chapter ${c.slug}`);
          }
        }
        for (const m of titles) {
          if (m.order <= current.order || m.slug === gate) continue;
          if (
            json.includes(m.title) ||
            json.includes(`"${m.slug}"`) ||
            slugged.includes(m.slugged)
          ) {
            leaks.push(`${id} at ${current.slug} leaks ${m.slug}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
