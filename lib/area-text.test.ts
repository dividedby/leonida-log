import { describe, expect, it } from "vitest";
import { parseCurated, type Area } from "./curated";
import { fixtureRaw, type FixtureRaw } from "./test-fixtures/curated";
import { areaTextLeaks, namesArea } from "./area-text";

const keys: Area = {
  slug: "keys",
  name: "Leonida Keys",
  aliases: ["the Keys"],
  visible_after_mission: "m1",
  sources: [],
};

describe("namesArea", () => {
  it.each([
    ["Leonida Keys", true],
    ["a trip to LEONIDA KEYS!", true],
    ["Down in the Keys, near the dock", true],
    ["the keys.", true],
    ["leonida-keys", true],
    ["Find the monkeys", false],
    ["Pick up keys", false],
    ["Leonida Keyset", false],
    ["Leonida", false],
  ])("%j -> %s", (text, expected) => {
    expect(namesArea(text, keys)).toBe(expected);
  });
});

describe("areaTextLeaks", () => {
  // r1 visible m1, r2 ("Region Two") m5, d1 ("District One") m6
  it("is empty for the fixture", () => {
    expect(areaTextLeaks(parseCurated(fixtureRaw()))).toEqual([]);
  });

  const leaking: {
    name: string;
    edit: (raw: FixtureRaw) => void;
    leak: string;
  }[] = [
    {
      name: "item text before the area is visible",
      edit: (r) => (r.itemFiles.m3.items[0].how_to = "Head to District One."),
      leak: "item a names District One",
    },
    {
      name: "item location through an alias",
      edit: (r) => {
        r.areas.areas[1].aliases = ["Twoland"];
        r.itemFiles.m3.items[1].location = "Out in twoland.";
      },
      leak: "item b names Region Two",
    },
    {
      name: "optional mission note before its anchor",
      edit: (r) => (r.missions.missions[8].note = "Near Region Two."),
      leak: "optional o1 names Region Two",
    },
    {
      name: "optional mission title",
      edit: (r) => (r.missions.missions[10].title = "Trip to District One"),
      leak: "optional o3 names District One",
    },
    {
      name: "main mission title",
      edit: (r) => (r.missions.missions[7].title = "Escape from Region Two"),
      leak: "mission m8 names Region Two",
    },
    {
      name: "chapter name before its first mission",
      edit: (r) => (r.missions.chapters[0].title = "Welcome to Region Two"),
      leak: "chapter first-chapter names Region Two",
    },
    {
      name: "gate lost entry",
      edit: (r) => (r.gates.gates[1].lost = ["The docks at District One"]),
      leak: 'gate m7 lost "The docks at District One" names District One',
    },
  ];

  it.each(leaking)("flags $name", ({ edit, leak }) => {
    const raw = fixtureRaw();
    edit(raw);
    expect(areaTextLeaks(parseCurated(raw))).toContain(leak);
  });

  it.each([
    {
      name: "an item visible once the area is",
      edit: (r: FixtureRaw) =>
        (r.itemFiles.m7.items[0].how_to = "Head to Region Two."),
    },
    {
      name: "an optional opening at the area's mission",
      edit: (r: FixtureRaw) =>
        (r.missions.missions[11].note = "Near Region Two."),
    },
    {
      name: "a chapter whose first mission shows the area",
      edit: (r: FixtureRaw) =>
        (r.missions.chapters[1].title = "Region Two Rising"),
    },
  ])("allows $name", ({ edit }) => {
    const raw = fixtureRaw();
    edit(raw);
    expect(areaTextLeaks(parseCurated(raw))).toEqual([]);
  });
});
