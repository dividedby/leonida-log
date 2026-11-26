import { describe, expect, it } from "vitest";
import {
  closesIn,
  countdownLabel,
  gateOptionals,
  isVisible,
  lockedSummary,
  missionTitle,
  missionsInChapter,
  nextGate,
  pickerChapters,
  safeToLeave,
} from "./gates";
import { parseCurated } from "./curated";
import { fixtureData, fixtureRaw } from "./test-fixtures/curated";

const data = fixtureData();

function itemById(id: string) {
  const found = data.items.find((i) => i.id === id);
  if (!found) throw new Error(`no fixture item ${id}`);
  return found;
}

function gateAt(mission: string) {
  const found = data.gates.find((g) => g.mission === mission);
  if (!found) throw new Error(`no fixture gate ${mission}`);
  return found;
}

describe("isVisible", () => {
  // item "b" becomes visible at m2
  it.each([
    { current: "m1", expected: false },
    { current: "m2", expected: true },
    { current: "m3", expected: true },
    { current: "m8", expected: true },
  ])(
    "item visible after m2, current $current -> $expected",
    ({ current, expected }) => {
      expect(isVisible(data, itemById("b"), current)).toBe(expected);
    },
  );

  it("throws on an unknown current mission", () => {
    expect(() => isVisible(data, itemById("b"), "nope")).toThrow(/nope/);
  });
});

describe("nextGate", () => {
  it.each([
    { name: "before the first gate", current: "m1", expected: "m3" },
    { name: "on the gate (not yet passed)", current: "m3", expected: "m3" },
    { name: "after the first gate", current: "m4", expected: "m7" },
    { name: "on the last gate", current: "m7", expected: "m7" },
    { name: "after the last gate", current: "m8", expected: null },
  ])("$name", ({ current, expected }) => {
    expect(nextGate(data, current)?.mission ?? null).toBe(expected);
  });

  it("carries the gate's mission number", () => {
    expect(nextGate(data, "m1")?.order).toBe(3);
  });

  it("throws on an unknown current mission", () => {
    expect(() => nextGate(data, "nope")).toThrow(/nope/);
  });
});

describe("lockedSummary", () => {
  // gate m3 items: a (m1), b (m2), c (m3); gate m7 items: d (m5), e (m7)
  it.each([
    { gate: "m3", current: "m1", count: 2, unlock: "m2" },
    { gate: "m3", current: "m2", count: 1, unlock: "m3" },
    { gate: "m3", current: "m3", count: 0, unlock: null },
    { gate: "m3", current: "m8", count: 0, unlock: null },
    // o3 (opens at m2, closes at gate m7) is hidden at m1 and counts
    { gate: "m7", current: "m1", count: 3, unlock: "m2" },
    { gate: "m7", current: "m2", count: 2, unlock: "m5" },
    { gate: "m7", current: "m5", count: 1, unlock: "m7" },
    { gate: "m7", current: "m7", count: 0, unlock: null },
  ])(
    "gate $gate at $current -> $count locked",
    ({ gate, current, count, unlock }) => {
      expect(lockedSummary(data, gateAt(gate), current)).toEqual({
        count,
        unlockMission: unlock,
      });
    },
  );

  it("names the main anchor of an unopened optional, never the optional", () => {
    const raw = fixtureRaw();
    raw.missions.missions[10].opens_after = "o4"; // o3 now opens via o4, anchored at m5
    const chained = parseCurated(raw);
    const gate = chained.gates.find((g) => g.mission === "m7");
    if (!gate) throw new Error("no gate m7");
    expect(lockedSummary(chained, gate, "m1")).toEqual({
      count: 3,
      unlockMission: "m5",
    });
  });

  it("throws on an unknown current mission", () => {
    expect(() => lockedSummary(data, gateAt("m3"), "nope")).toThrow(/nope/);
  });
});

describe("closesIn", () => {
  it.each([
    {
      name: "two missions later",
      current: "m1",
      closesAt: "m3",
      expected: { state: "open", missions: 2 },
    },
    {
      name: "one mission later",
      current: "m2",
      closesAt: "m3",
      expected: { state: "open", missions: 1 },
    },
    {
      name: "standing on it",
      current: "m3",
      closesAt: "m3",
      expected: { state: "closed" },
    },
    {
      name: "already past",
      current: "m5",
      closesAt: "m3",
      expected: { state: "closed" },
    },
    {
      name: "never closes",
      current: "m1",
      closesAt: "never",
      expected: { state: "never" },
    },
  ])("$name", ({ current, closesAt, expected }) => {
    expect(closesIn(data, current, closesAt)).toEqual(expected);
  });

  it("counts down to a gate mission the same way", () => {
    expect(closesIn(data, "m1", gateAt("m7").mission)).toEqual({
      state: "open",
      missions: 6,
    });
  });

  it.each([
    {
      name: "unknown closing mission",
      current: "m1",
      closesAt: "nope",
      slug: "nope",
    },
    {
      name: "unknown current mission",
      current: "nope",
      closesAt: "m3",
      slug: "nope",
    },
    {
      name: "unknown current with never",
      current: "nope",
      closesAt: "never",
      slug: "nope",
    },
    {
      name: "optional as closing mission",
      current: "m1",
      closesAt: "o1",
      slug: "o1",
    },
    {
      name: "optional as current mission",
      current: "o1",
      closesAt: "m3",
      slug: "o1",
    },
  ])("throws on $name", ({ current, closesAt, slug }) => {
    expect(() => closesIn(data, current, closesAt)).toThrow(slug);
  });
});

describe("countdownLabel", () => {
  it.each([
    {
      name: "open 3",
      countdown: { state: "open", missions: 3 },
      label: "Closes in 3 missions",
    },
    {
      name: "open 2",
      countdown: { state: "open", missions: 2 },
      label: "Closes in 2 missions",
    },
    {
      name: "open 1",
      countdown: { state: "open", missions: 1 },
      label: "Do this before your next story mission",
    },
    { name: "closed", countdown: { state: "closed" }, label: null },
    { name: "never", countdown: { state: "never" }, label: null },
  ] as const)("$name", ({ countdown, label }) => {
    expect(countdownLabel(countdown)).toBe(label);
  });
});

describe("gateOptionals", () => {
  function forGate(d: typeof data, gate: string, current: string) {
    const g = d.gates.find((x) => x.mission === gate);
    if (!g) throw new Error(`no gate ${gate}`);
    return gateOptionals(d, g, current).map((r) => [
      r.mission.slug,
      r.countdown.missions,
    ]);
  }

  // o1, o2 close at gate m3 (open from m1); o3 closes at gate m7 (opens m2)
  it.each([
    {
      gate: "m3",
      current: "m1",
      rows: [
        ["o1", 2],
        ["o2", 2],
      ],
    },
    {
      gate: "m3",
      current: "m2",
      rows: [
        ["o1", 1],
        ["o2", 1],
      ],
    },
    { gate: "m3", current: "m3", rows: [] }, // closed: standing on the closing mission
    { gate: "m3", current: "m6", rows: [] },
    { gate: "m7", current: "m1", rows: [] }, // o3 not opened yet
    { gate: "m7", current: "m2", rows: [["o3", 5]] },
    { gate: "m7", current: "m6", rows: [["o3", 1]] },
    { gate: "m7", current: "m7", rows: [] },
  ])("gate $gate at $current", ({ gate, current, rows }) => {
    expect(forGate(data, gate, current)).toEqual(rows);
  });

  it("binds a mission that closes before a gate to the first gate at or after it", () => {
    const raw = fixtureRaw();
    raw.missions.missions[10].closes_at = "m5"; // o3 closes between the gates
    const early = parseCurated(raw);
    expect(forGate(early, "m7", "m2")).toEqual([["o3", 3]]);
    expect(forGate(early, "m3", "m2")).toEqual([
      ["o1", 1],
      ["o2", 1],
    ]);
  });

  it("sorts by urgency, most urgent first", () => {
    const raw = fixtureRaw();
    raw.missions.missions.push({
      ...raw.missions.missions[10],
      slug: "o5",
      opens_after: "m1",
      closes_at: "m6",
    });
    expect(forGate(parseCurated(raw), "m7", "m2")).toEqual([
      ["o5", 4],
      ["o3", 5],
    ]);
  });

  it("never lists a mission that never closes", () => {
    for (const current of ["m1", "m5", "m8"]) {
      for (const g of data.gates) {
        const slugs = gateOptionals(data, g, current).map(
          (r) => r.mission.slug,
        );
        expect(slugs).not.toContain("o4");
      }
    }
  });
});

describe("safeToLeave", () => {
  it.each([
    { current: "m1", slugs: [] },
    { current: "m4", slugs: [] },
    { current: "m5", slugs: ["o4"] },
    { current: "m8", slugs: ["o4"] },
  ])("at $current", ({ current, slugs }) => {
    expect(safeToLeave(data, current).map((o) => o.slug)).toEqual(slugs);
  });
});

describe("the current mission is always a main mission", () => {
  it.each([
    ["isVisible", () => isVisible(data, itemById("b"), "o1")],
    ["nextGate", () => nextGate(data, "o1")],
    ["lockedSummary", () => lockedSummary(data, gateAt("m3"), "o1")],
    ["pickerChapters", () => pickerChapters(data, "o1")],
    ["safeToLeave", () => safeToLeave(data, "o1")],
    ["gateOptionals", () => gateOptionals(data, gateAt("m3"), "o1")],
  ])("%s throws on an optional slug", (_name, run) => {
    expect(run).toThrow(/o1/);
  });

  it("the picker lists no optional missions", () => {
    const listed = data.chapters.flatMap((c) =>
      missionsInChapter(data, c.slug).map((m) => m.slug),
    );
    expect(listed).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]);
  });
});

describe("missionsInChapter", () => {
  it("lists one chapter's missions in order with chapter-local numbers", () => {
    expect(missionsInChapter(data, "second-chapter")).toEqual([
      { slug: "m5", order: 5, number: 1 },
      { slug: "m6", order: 6, number: 2 },
      { slug: "m7", order: 7, number: 3 },
      { slug: "m8", order: 8, number: 4 },
    ]);
  });

  it("includes no other chapter", () => {
    const slugs = missionsInChapter(data, "first-chapter").map((m) => m.slug);
    expect(slugs).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("returns no titles", () => {
    for (const m of missionsInChapter(data, "first-chapter")) {
      expect(Object.keys(m).sort()).toEqual(["number", "order", "slug"]);
    }
  });

  it("throws on an unknown chapter", () => {
    expect(() => missionsInChapter(data, "nope")).toThrow(/nope/);
  });
});

describe("missionTitle", () => {
  it("looks up one mission's title", () => {
    expect(missionTitle(data, "m6")).toBe("Mission m6");
  });

  it("throws on an unknown mission", () => {
    expect(() => missionTitle(data, "nope")).toThrow(/nope/);
  });
});

describe("pickerChapters", () => {
  it.each([
    { name: "no current mission", current: null, names: [null, null] },
    {
      name: "mid first chapter",
      current: "m2",
      names: ["First Chapter", null],
    },
    {
      name: "last mission of first chapter",
      current: "m4",
      names: ["First Chapter", null],
    },
    {
      name: "first mission of second chapter",
      current: "m5",
      names: ["First Chapter", "Second Chapter"],
    },
  ])("$name", ({ current, names }) => {
    const chapters = pickerChapters(data, current);
    expect(chapters.map((c) => c.slug)).toEqual([
      "first-chapter",
      "second-chapter",
    ]);
    expect(chapters.map((c) => c.name)).toEqual(names);
  });

  it("throws on an unknown current mission", () => {
    expect(() => pickerChapters(data, "nope")).toThrow(/nope/);
  });
});
