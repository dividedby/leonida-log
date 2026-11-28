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

  it("derives optional missions: anchor via the chain, order, and no closing order for never", () => {
    const { optionalMissions } = parseCurated(fixtureRaw());
    expect(
      optionalMissions.map((o) => [
        o.slug,
        o.opensAnchor,
        o.opensOrder,
        o.closesAt,
        o.closesOrder,
      ]),
    ).toEqual([
      ["o1", "m1", 1, "m3", 3],
      ["o2", "m1", 1, "m3", 3],
      ["o3", "m2", 2, "m7", 7],
      ["o4", "m5", 5, "never", null],
    ]);
    expect(optionalMissions[0]).toMatchObject({
      title: "Optional o1",
      kind: "optional",
      chapter: "first-chapter",
      character: "jason",
    });
  });

  it("sorts optional missions by opens order, then file order", () => {
    const raw = fixtureRaw();
    raw.missions.missions = [
      ...raw.missions.missions.slice(0, 8),
      ...raw.missions.missions.slice(8).reverse(),
    ];
    expect(parseCurated(raw).optionalMissions.map((o) => o.slug)).toEqual([
      "o2",
      "o1",
      "o3",
      "o4",
    ]);
  });

  it("leaves main order, chapter order, counts and gate order unchanged by optionals, wherever they are listed", () => {
    const withoutOptionals = fixtureRaw();
    withoutOptionals.missions.missions =
      withoutOptionals.missions.missions.slice(0, 8);
    // Optionals that open at mains only, so they stay valid with no chain.
    const interleaved = withoutOptionals.missions.missions.slice();
    const base = fixtureRaw().missions.missions;
    interleaved.splice(0, 0, base[11]);
    interleaved.splice(3, 0, base[8]);
    interleaved.splice(7, 0, base[10]);

    const plain = parseCurated(withoutOptionals);
    const raw = fixtureRaw();
    raw.missions.missions = interleaved;
    const mixed = parseCurated(raw);

    expect(mixed.missions).toEqual(plain.missions);
    expect(mixed.chapters).toEqual(plain.chapters);
    expect(mixed.gates).toEqual(plain.gates);
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
      name: "unknown evidence basis",
      edit: (r) => (r.itemFiles.m3.items[0].evidence = { basis: "unknown" }),
      error: "items/m3.yaml: items.0.evidence.basis",
    },
    {
      name: "evidence without a basis",
      edit: (r) => (r.missions.missions[8].evidence = { note: "Why." }),
      error: "missions.yaml: missions.8.evidence.basis",
    },
    {
      name: "unknown evidence field (strict)",
      edit: (r) =>
        (r.missions.missions[0].evidence = {
          basis: "best-guess",
          confidence: "low",
        }),
      error: "missions.yaml: missions.0.evidence",
    },
    {
      name: "empty evidence note",
      edit: (r) =>
        (r.itemFiles.m3.items[0].evidence = { basis: "best-guess", note: " " }),
      error: "items/m3.yaml: items.0.evidence.note",
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
    {
      name: "optional without opens_after",
      edit: (r) => delete r.missions.missions[8].opens_after,
      error: "missions.yaml: missions.8.opens_after",
    },
    {
      name: "optional without closes_at",
      edit: (r) => delete r.missions.missions[8].closes_at,
      error: "missions.yaml: missions.8.closes_at",
    },
    {
      name: "optional without character",
      edit: (r) => delete r.missions.missions[8].character,
      error: "missions.yaml: missions.8.character",
    },
    {
      name: "optional without sources",
      edit: (r) => delete r.missions.missions[8].sources,
      error: "missions.yaml: missions.8.sources",
    },
    {
      name: "optional with empty sources",
      edit: (r) => (r.missions.missions[8].sources = []),
      error: "missions.yaml: missions.8.sources",
    },
    {
      name: "main mission with closes_at",
      edit: (r) => (r.missions.missions[0].closes_at = "m3"),
      error: "missions.yaml: missions.0.closes_at",
    },
    {
      name: "main mission with a note",
      edit: (r) => (r.missions.missions[0].note = "Hello."),
      error: "missions.yaml: missions.0.note",
    },
    {
      name: "unknown kind",
      edit: (r) => (r.missions.missions[8].kind = "side-quest"),
      error: "missions.yaml: missions.8.kind",
    },
    {
      name: "mission slug never (reserved)",
      edit: (r) => (r.missions.missions[11].slug = "never"),
      error: "missions.yaml: missions.11.slug",
    },
    {
      name: "unknown opens_after",
      edit: (r) => (r.missions.missions[8].opens_after = "nope"),
      error: 'unknown opens_after "nope"',
    },
    {
      name: "unknown closes_at",
      edit: (r) => (r.missions.missions[8].closes_at = "nope"),
      error: 'unknown closes_at "nope"',
    },
    {
      name: "closes_at naming an optional",
      edit: (r) => (r.missions.missions[8].closes_at = "o2"),
      error: 'closes_at "o2" which is an optional mission',
    },
    {
      name: "opens_after later than closes_at",
      edit: (r) => (r.missions.missions[8].opens_after = "m4"),
      error: 'opens_after "m4" which is later than closes_at "m3"',
    },
    {
      name: "opens_after cycle",
      edit: (r) => (r.missions.missions[8].opens_after = "o2"),
      error: "opens_after cycle",
    },
    {
      name: "closes_at after the last gate",
      edit: (r) => (r.missions.missions[11].closes_at = "m8"),
      error: 'closes_at "m8" which is after the last gate',
    },
    {
      name: "item id equal to an optional slug",
      edit: (r) => (r.itemFiles.m3.items[0].id = "o1"),
      error: 'item id "o1" is also a mission slug',
    },
    {
      name: "item id equal to a main slug",
      edit: (r) => (r.itemFiles.m3.items[0].id = "m4"),
      error: 'item id "m4" is also a mission slug',
    },
    {
      name: "optional with an unknown chapter",
      edit: (r) => (r.missions.missions[8].chapter = "nope"),
      error: 'mission "o1" has unknown chapter "nope"',
    },
    {
      name: "gate on an optional",
      edit: (r) => (r.gates.gates[0].mission = "o1"),
      error: 'gate mission "o1" is not a mission',
    },
    {
      name: "duplicate area slug",
      edit: (r) => (r.areas.areas[1].slug = "r1"),
      error: 'duplicate area slug "r1"',
    },
    {
      name: "area name already used (case-insensitive)",
      edit: (r) => (r.areas.areas[1].name = "REGION one"),
      error: 'area "r2" has name "REGION one" already used by area "r1"',
    },
    {
      name: "alias already used by another area",
      edit: (r) => (r.areas.areas[1].aliases = ["The REGION"]),
      error: 'area "r2" has alias "The REGION" already used by area "r1"',
    },
    {
      name: "alias equal to another area's name",
      edit: (r) => (r.areas.areas[1].aliases = ["region one"]),
      error: 'area "r2" has alias "region one" already used by area "r1"',
    },
    {
      name: "alias repeated inside one area",
      edit: (r) => (r.areas.areas[0].aliases = ["Same", "same"]),
      error: 'area "r1" has alias "same" already used by area "r1"',
    },
    {
      name: "empty alias",
      edit: (r) => (r.areas.areas[0].aliases = [" "]),
      error: "areas.yaml: areas.0.aliases.0",
    },
    {
      name: "alias with no letters or digits",
      edit: (r) => (r.areas.areas[0].aliases = ["!!!"]),
      error: 'area "r1" has alias "!!!" with no letters or digits',
    },
    {
      name: "area with an unknown parent",
      edit: (r) => (r.areas.areas[2].parent = "nope"),
      error: 'area "d1" has unknown parent "nope"',
    },
    {
      name: "area that is its own parent",
      edit: (r) => (r.areas.areas[0].parent = "r1"),
      error: 'area "r1" is its own parent',
    },
    {
      name: "parent that has a parent itself",
      edit: (r) => (r.areas.areas[1].parent = "r1"),
      error: 'area "d1" has parent "r2" which has a parent itself',
    },
    {
      name: "district visible before its parent",
      edit: (r) => (r.areas.areas[2].visible_after_mission = "m4"),
      error: 'area "d1" is visible before its parent "r2"',
    },
    {
      name: "area with an unknown visible_after_mission",
      edit: (r) => (r.areas.areas[0].visible_after_mission = "nope"),
      error: 'area "r1" has unknown visible_after_mission "nope"',
    },
    {
      name: "area visible after an optional mission",
      edit: (r) => (r.areas.areas[0].visible_after_mission = "o1"),
      error: 'area "r1" has unknown visible_after_mission "o1"',
    },
    {
      name: "area without a source",
      edit: (r) => (r.areas.areas[0].sources = []),
      error: "areas.yaml: areas.0.sources",
    },
    {
      name: "area with a non-https source",
      edit: (r) => {
        r.areas.areas[0].sources = [
          { url: "http://example.com", title: "t", accessed: "2026-11-25" },
        ];
      },
      error: "areas.yaml: areas.0.sources.0.url",
    },
    {
      name: "area with an unknown field (strict)",
      edit: (r) => (r.areas.areas[0].order = 1),
      error: "areas.yaml",
    },
    {
      name: "area with an unknown evidence basis",
      edit: (r) => (r.areas.areas[0].evidence = { basis: "unknown" }),
      error: "areas.yaml: areas.0.evidence.basis",
    },
    {
      name: "item with an unknown area",
      edit: (r) => (r.itemFiles.m3.items[0].area = "nope"),
      error: 'item "a" has unknown area "nope"',
    },
    {
      name: "item whose area becomes visible after the item",
      edit: (r) => (r.itemFiles.m3.items[1].area = "r2"),
      error: 'item "b" has area "r2" which becomes visible after the item',
    },
    {
      name: "optional mission with an unknown area",
      edit: (r) => (r.missions.missions[8].area = "nope"),
      error: 'optional mission "o1" has unknown area "nope"',
    },
    {
      name: "optional mission whose area becomes visible after its opens_after",
      edit: (r) => (r.missions.missions[10].area = "r2"),
      error:
        'optional mission "o3" has area "r2" which becomes visible after its anchor "m2"',
    },
    {
      name: "optional mission opened through a chain, area after the anchor",
      edit: (r) => (r.missions.missions[9].area = "r2"),
      error:
        'optional mission "o2" has area "r2" which becomes visible after its anchor "m1"',
    },
    {
      name: "main mission with an area",
      edit: (r) => (r.missions.missions[0].area = "r1"),
      error: "missions.yaml: missions.0.area",
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

  it("accepts evidence on items, main missions and optional missions, and never returns it", () => {
    const raw = fixtureRaw();
    const evidence = {
      basis: "safe-bound",
      note: "Earliest plausible cutoff.",
    };
    raw.itemFiles.m3.items[0].evidence = evidence;
    raw.missions.missions[0].evidence = { basis: "two-sources" };
    raw.missions.missions[8].evidence = evidence;
    const data = parseCurated(raw);
    const output = JSON.stringify(data);
    expect(output).not.toContain('"evidence"');
    expect(output).not.toContain('"verified"');
    expect(data.items.map((i) => i.id)).toContain("a");
  });

  it("accepts opens_after equal to closes_at", () => {
    const raw = fixtureRaw();
    raw.missions.missions[8].opens_after = "m3";
    expect(() => parseCurated(raw)).not.toThrow();
  });

  it("accepts lost_at equal to visible_after and to the gate", () => {
    const raw = fixtureRaw();
    raw.itemFiles.m3.items[2].lost_at_mission = "m3";
    expect(() => parseCurated(raw)).not.toThrow();
  });

  describe("areas", () => {
    it("keeps slug, name, aliases, visibility, parent and sources, in file order", () => {
      const { areas } = parseCurated(fixtureRaw());
      expect(areas).toEqual([
        {
          slug: "r1",
          name: "Region One",
          aliases: ["the Region"],
          visible_after_mission: "m1",
          sources: [
            {
              url: "https://example.com/guide",
              title: "Example guide",
              accessed: "2026-11-25",
            },
          ],
        },
        expect.objectContaining({ slug: "r2", visible_after_mission: "m5" }),
        expect.objectContaining({
          slug: "d1",
          parent: "r2",
          visible_after_mission: "m6",
        }),
      ]);
      expect(areas[1]).not.toHaveProperty("aliases");
      expect(areas[1]).not.toHaveProperty("parent");
    });

    it("accepts an empty areas list", () => {
      const raw = fixtureRaw();
      raw.areas.areas = [];
      expect(parseCurated(raw).areas).toEqual([]);
    });

    it("accepts evidence on an area and never returns it", () => {
      const raw = fixtureRaw();
      raw.areas.areas[0].evidence = { basis: "best-guess", note: "Why." };
      const data = parseCurated(raw);
      expect(JSON.stringify(data)).not.toContain('"evidence"');
      expect(data.areas[0].slug).toBe("r1");
    });

    it("accepts a district visible at the same mission as its parent", () => {
      const raw = fixtureRaw();
      raw.areas.areas[2].visible_after_mission = "m5";
      expect(() => parseCurated(raw)).not.toThrow();
    });

    it("keeps an item's area and an optional mission's area, and leaves them off when unset", () => {
      const raw = fixtureRaw();
      raw.itemFiles.m7.items[0].area = "r2"; // item d, visible m5, area m5
      raw.itemFiles.m7.items[1].area = "d1"; // item e, visible m7, area m6
      raw.missions.missions[8].area = "r1"; // o1, anchor m1, area m1
      raw.missions.missions[9].area = "r1"; // o2, anchor m1 through o1
      raw.missions.missions[11].area = "r2"; // o4, anchor m5, area m5
      const data = parseCurated(raw);
      const itemArea = (id: string) =>
        data.items.find((i) => i.id === id)?.area;
      expect(itemArea("d")).toBe("r2");
      expect(itemArea("e")).toBe("d1");
      expect(data.items.find((i) => i.id === "a")).not.toHaveProperty("area");
      const optionalArea = (slug: string) =>
        data.optionalMissions.find((o) => o.slug === slug)?.area;
      expect(optionalArea("o1")).toBe("r1");
      expect(optionalArea("o2")).toBe("r1");
      expect(optionalArea("o4")).toBe("r2");
      expect(
        data.optionalMissions.find((o) => o.slug === "o3"),
      ).not.toHaveProperty("area");
    });
  });
});
