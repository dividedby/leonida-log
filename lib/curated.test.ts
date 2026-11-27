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
});
