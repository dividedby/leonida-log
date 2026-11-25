import { describe, expect, it } from "vitest";
import { CuratedValidationError, parseCurated } from "./curated";
import { fixtureRaw, type FixtureRaw } from "./test-fixtures/curated";

describe("parseCurated", () => {
  it("derives order, chapter order and counts", () => {
    const data = parseCurated(fixtureRaw());
    expect(data.missions.map((m) => [m.slug, m.order, m.chapterOrder])).toEqual(
      [
        ["m1", 1, 1],
        ["m2", 2, 2],
        ["m3", 3, 3],
        ["m4", 4, 4],
        ["m5", 5, 1],
        ["m6", 6, 2],
        ["m7", 7, 3],
        ["m8", 8, 4],
      ],
    );
    expect(data.chapters.map((c) => [c.order, c.missionCount])).toEqual([
      [1, 4],
      [2, 4],
    ]);
    expect(data.gates.map((g) => [g.mission, g.order])).toEqual([
      ["m3", 3],
      ["m7", 7],
    ]);
    expect(data.items).toHaveLength(5);
  });

  it("sorts gates by mission order regardless of file order", () => {
    const raw = fixtureRaw();
    raw.gates.gates.reverse();
    expect(parseCurated(raw).gates.map((g) => g.mission)).toEqual(["m3", "m7"]);
  });

  const invalid: {
    name: string;
    edit: (raw: FixtureRaw) => void;
    error: string;
  }[] = [
    {
      name: "item without visible_after_mission",
      edit: (r) => delete r.itemFiles.m3.items[0].visible_after_mission,
      error: "items/m3.yaml: items.0.visible_after_mission",
    },
    {
      name: "unknown field (strict)",
      edit: (r) => (r.itemFiles.m3.items[0].order = 1),
      error: "items/m3.yaml",
    },
    {
      name: "non-https source",
      edit: (r) => {
        r.gates.gates[0].sources = [
          { url: "http://example.com", title: "t", accessed: "2026-11-25" },
        ];
      },
      error: "gates.yaml: gates.0.sources.0.url",
    },
    {
      name: "item without a source",
      edit: (r) => (r.itemFiles.m3.items[0].sources = []),
      error: "items/m3.yaml: items.0.sources",
    },
    {
      name: "malformed accessed date",
      edit: (r) => {
        r.gates.gates[0].sources = [
          { url: "https://example.com", title: "t", accessed: "yesterday" },
        ];
      },
      error: "gates.yaml: gates.0.sources.0.accessed",
    },
    {
      name: "duplicate mission slug",
      edit: (r) => (r.missions.missions[1].slug = "m1"),
      error: 'duplicate mission slug "m1"',
    },
    {
      name: "duplicate chapter slug",
      edit: (r) => (r.missions.chapters[1].slug = "first-chapter"),
      error: 'duplicate chapter slug "first-chapter"',
    },
    {
      name: "duplicate item id across files",
      edit: (r) => (r.itemFiles.m7.items[0].id = "a"),
      error: 'duplicate item id "a"',
    },
    {
      name: "duplicate gate",
      edit: (r) => (r.gates.gates[1].mission = "m3"),
      error: 'duplicate gate "m3"',
    },
    {
      name: "mission with unknown chapter",
      edit: (r) => (r.missions.missions[0].chapter = "nope"),
      error: 'mission "m1" has unknown chapter "nope"',
    },
    {
      name: "missions out of chapter order",
      edit: (r) => (r.missions.missions[0].chapter = "second-chapter"),
      error: 'mission "m2" is out of chapter order',
    },
    {
      name: "chapter without missions",
      edit: (r) => r.missions.chapters.push({ slug: "empty", title: "Empty" }),
      error: 'chapter "empty" has no missions',
    },
    {
      name: "gate on a non-mission",
      edit: (r) => (r.gates.gates[0].mission = "nope"),
      error: 'gate mission "nope" is not a mission',
    },
    {
      name: "item for a non-gate",
      edit: (r) => (r.itemFiles.m3.items[0].before_gate = "m4"),
      error: 'item "a" has before_gate "m4" which is not a gate',
    },
    {
      name: "item in the wrong gate file",
      edit: (r) => (r.itemFiles.m3.items[0].before_gate = "m7"),
      error: 'items in this file must use "m3"',
    },
    {
      name: "unknown visible_after_mission",
      edit: (r) => (r.itemFiles.m3.items[0].visible_after_mission = "nope"),
      error: 'unknown visible_after_mission "nope"',
    },
    {
      name: "unknown lost_at_mission",
      edit: (r) => (r.itemFiles.m3.items[1].lost_at_mission = "nope"),
      error: 'unknown lost_at_mission "nope"',
    },
    {
      name: "lost before visible",
      edit: (r) => (r.itemFiles.m3.items[1].lost_at_mission = "m1"),
      error: "lost before it becomes visible",
    },
    {
      name: "visible after its gate",
      edit: (r) => (r.itemFiles.m3.items[0].visible_after_mission = "m4"),
      error: "becomes visible after its gate",
    },
    {
      name: "lost after its gate",
      edit: (r) => (r.itemFiles.m3.items[1].lost_at_mission = "m4"),
      error: "is lost after its gate",
    },
  ];

  it.each(invalid)("rejects $name", ({ edit, error }) => {
    const raw = fixtureRaw();
    edit(raw);
    const run = () => parseCurated(raw);
    expect(run).toThrow(CuratedValidationError);
    expect(run).toThrow(error);
  });

  it("reports every issue at once", () => {
    const raw = fixtureRaw();
    raw.itemFiles.m3.items[0].visible_after_mission = "nope";
    raw.itemFiles.m7.items[0].lost_at_mission = "nope";
    try {
      parseCurated(raw);
      expect.unreachable();
    } catch (error) {
      expect((error as CuratedValidationError).issues).toHaveLength(2);
    }
  });

  it("accepts lost_at equal to visible_after and to the gate", () => {
    const raw = fixtureRaw();
    raw.itemFiles.m3.items[2].lost_at_mission = "m3";
    expect(() => parseCurated(raw)).not.toThrow();
  });
});
