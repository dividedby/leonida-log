import { describe, expect, it } from "vitest";
import {
  isVisible,
  lockedSummary,
  missionTitle,
  missionsInChapter,
  nextGate,
  pickerChapters,
} from "./gates";
import { fixtureData } from "./test-fixtures/curated";

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
    { gate: "m7", current: "m1", count: 2, unlock: "m5" },
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

  it("throws on an unknown current mission", () => {
    expect(() => lockedSummary(data, gateAt("m3"), "nope")).toThrow(/nope/);
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
