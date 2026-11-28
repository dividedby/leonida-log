import { describe, expect, it } from "vitest";
import { loadCurated } from "./curated-load";
import type { Countdown } from "./gates";
import { nextGate } from "./gates";
import {
  SOON_LOST_WITHIN,
  chipsFor,
  gateChecklist,
  gateProgress,
  homeView,
  statRows,
  upNext,
  type ChecklistRowData,
} from "./home";
import { fixtureData } from "./test-fixtures/curated";

const data = fixtureData();
const real = loadCurated();

function gateAt(mission: string) {
  const found = data.gates.find((g) => g.mission === mission);
  if (!found) throw new Error(`no fixture gate ${mission}`);
  return found;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// Fixture: gate m3 has items a (visible m1), b (m2, lost m3), c (m3) and
// optionals o1, o2 (open m1, close m3); gate m7 has d (m5), e (m7) and o3
// (opens m2, closes m7); o4 opens m5 and never closes.
describe("gateChecklist", () => {
  it("lists visible items in file order, then opened optionals", () => {
    expect(ids(gateChecklist(data, gateAt("m3"), "m1"))).toEqual([
      "a",
      "o1",
      "o2",
    ]);
    expect(ids(gateChecklist(data, gateAt("m3"), "m2"))).toEqual([
      "a",
      "b",
      "o1",
      "o2",
    ]);
  });

  it("includes an item the moment its visible_after_mission is reached", () => {
    expect(ids(gateChecklist(data, gateAt("m7"), "m4"))).toEqual(["o3"]);
    expect(ids(gateChecklist(data, gateAt("m7"), "m5"))).toEqual(["d", "o3"]);
  });

  it("excludes hidden items and unopened optionals", () => {
    const rows = gateChecklist(data, gateAt("m7"), "m1");
    expect(rows).toEqual([]);
  });

  it("carries a countdown for items with a cutoff and never otherwise", () => {
    const rows = gateChecklist(data, gateAt("m3"), "m2");
    const closes = Object.fromEntries(rows.map((r) => [r.id, r.closes]));
    expect(closes).toEqual({
      a: { state: "never" },
      b: { state: "open", missions: 1 },
      o1: { state: "open", missions: 1 },
      o2: { state: "open", missions: 1 },
    });
  });

  it("keeps an item past its cutoff listed, closed", () => {
    const rows = gateChecklist(data, gateAt("m3"), "m3");
    expect(rows.find((r) => r.id === "b")?.closes).toEqual({ state: "closed" });
    expect(ids(rows)).toEqual(["a", "b", "c"]);
  });

  it("tags kinds and titles", () => {
    const rows = gateChecklist(data, gateAt("m3"), "m1");
    expect(rows.map((r) => [r.kind, r.title])).toEqual([
      ["item", "Item a"],
      ["optional", "Optional o1"],
      ["optional", "Optional o2"],
    ]);
  });
});

function row(
  id: string,
  closes: Countdown = { state: "never" },
): ChecklistRowData {
  return { id, kind: "item", title: id, closes };
}

describe("gateProgress", () => {
  it("counts only ticks for the listed rows", () => {
    const rows = [row("a"), row("b"), row("c")];
    expect(gateProgress(rows, new Set(["a", "c", "elsewhere"]))).toEqual({
      done: 2,
      total: 3,
    });
  });

  it("is 0 of 0 for an empty list", () => {
    expect(gateProgress([], new Set(["a"]))).toEqual({ done: 0, total: 0 });
  });
});

describe("upNext", () => {
  const open = (missions: number): Countdown => ({ state: "open", missions });

  it("lists unchecked rows only", () => {
    const rows = [row("a"), row("b"), row("c")];
    expect(ids(upNext(rows, new Set(["a", "c"])))).toEqual(["b"]);
  });

  it("puts open countdowns first, fewest missions first, then the rest in order, skipping closed ones", () => {
    const rows = [
      row("never-1"),
      row("far", open(5)),
      row("near", open(1)),
      row("closed", { state: "closed" }),
      row("mid", open(3)),
      row("never-2"),
    ];
    expect(ids(upNext(rows, new Set(), 6))).toEqual([
      "near",
      "mid",
      "far",
      "never-1",
      "never-2",
    ]);
  });

  it("leaves out rows whose cutoff has passed, even with room to spare", () => {
    const rows = [
      row("gone", { state: "closed" }),
      row("kept"),
      row("gone-too", { state: "closed" }),
    ];
    expect(ids(upNext(rows, new Set()))).toEqual(["kept"]);
  });

  it("keeps the original order between equal countdowns", () => {
    const rows = [row("x", open(2)), row("y", open(2)), row("z", open(2))];
    expect(ids(upNext(rows, new Set()))).toEqual(["x", "y", "z"]);
  });

  it("defaults to 3 rows and honours a limit", () => {
    const rows = ["a", "b", "c", "d", "e"].map((id) => row(id));
    expect(upNext(rows, new Set())).toHaveLength(3);
    expect(upNext(rows, new Set(), 1)).toHaveLength(1);
  });
});

describe("chipsFor", () => {
  it("names the soon-lost threshold as a constant", () => {
    expect(SOON_LOST_WITHIN).toBe(3);
  });

  it.each([
    {
      missions: 1,
      label: "Do this before your next story mission",
      soon: true,
    },
    { missions: 2, label: "Closes in 2 missions", soon: true },
    { missions: 3, label: "Closes in 3 missions", soon: true },
    { missions: 4, label: "Closes in 4 missions", soon: false },
    { missions: 30, label: "Closes in 30 missions", soon: false },
  ])("open in $missions", ({ missions, label, soon }) => {
    const chips = chipsFor({ state: "open", missions });
    expect(chips.filter((c) => c.variant === "countdown")).toEqual([
      { variant: "countdown", text: label },
    ]);
    expect(chips.some((c) => c.variant === "soon-lost")).toBe(soon);
  });

  it.each([{ state: "never" }, { state: "closed" }] as const)(
    "shows no chip when %o",
    (closes) => {
      expect(chipsFor(closes)).toEqual([]);
    },
  );

  it("labels the soon-lost chip", () => {
    expect(chipsFor({ state: "open", missions: 2 })[0]).toEqual({
      variant: "soon-lost",
      text: "Soon lost",
    });
  });
});

describe("statRows", () => {
  it("returns Jason then Lucia, Strength, Cardio, Focus", () => {
    expect(
      statRows([
        { character: "lucia", stat: "focus", level: 4 },
        { character: "jason", stat: "cardio", level: 2 },
      ]),
    ).toEqual([
      {
        name: "Jason",
        stats: [
          { label: "Strength", level: 0 },
          { label: "Cardio", level: 2 },
          { label: "Focus", level: 0 },
        ],
      },
      {
        name: "Lucia",
        stats: [
          { label: "Strength", level: 0 },
          { label: "Cardio", level: 0 },
          { label: "Focus", level: 4 },
        ],
      },
    ]);
  });

  it("is all zeros with no rows", () => {
    const levels = statRows([]).flatMap((r) => r.stats.map((s) => s.level));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("homeView", () => {
  it("shows chapter, mission, chapter-relative position and the next gate", () => {
    expect(homeView(data, "m6", new Set(), [])).toMatchObject({
      eyebrow: "Chapter 2 · Second Chapter",
      title: "Mission m6",
      position: { number: 2, total: 4 },
      gate: { exit: 3, title: "Mission m7", done: 0, total: 2 },
    });
  });

  it("names the gate you are standing on", () => {
    expect(homeView(data, "m3", new Set(), []).gate?.title).toBe("Mission m3");
  });

  it("counts ticks against the gate's list only", () => {
    const view = homeView(data, "m2", new Set(["a", "o1", "e", "x"]), []);
    expect(view.gate).toMatchObject({ done: 2, total: 4 });
  });

  it("lists up to 3 unchecked rows, most urgent first, with chips", () => {
    const view = homeView(data, "m2", new Set(["o2"]), []);
    // b, o1 close in 1 mission; a never closes
    expect(ids(view.upNext)).toEqual(["b", "o1", "a"]);
    expect(view.upNext[0].chips).toEqual([
      { variant: "soon-lost", text: "Soon lost" },
      { variant: "countdown", text: "Do this before your next story mission" },
    ]);
    expect(view.upNext[2].chips).toEqual([]);
  });

  it("explains an empty list for a gate", () => {
    const view = homeView(data, "m1", new Set(["a", "o1", "o2"]), []);
    expect(view.upNext).toEqual([]);
    expect(view.emptyMessage).toBe("All done for Exit 3.");
  });

  it("after the last gate has no gate and lists the opened safe-to-leave rows", () => {
    const view = homeView(data, "m8", new Set(), []);
    expect(view.gate).toBeNull();
    expect(ids(view.upNext)).toEqual(["o4"]);
    expect(view.upNext[0].chips).toEqual([]);
    expect(homeView(data, "m8", new Set(["o4"]), []).upNext).toEqual([]);
    expect(homeView(data, "m8", new Set(["o4"]), []).emptyMessage).toBe(
      "No more points of no return.",
    );
  });

  it("includes the stat rows", () => {
    expect(
      homeView(data, "m1", new Set(), [
        { character: "jason", stat: "strength", level: 3 },
      ]).stats[0].stats[0],
    ).toEqual({ label: "Strength", level: 3 });
  });

  it("throws on an unknown mission", () => {
    expect(() => homeView(data, "nope", new Set(), [])).toThrow(/nope/);
  });
});

describe("homeView leaks (real data)", () => {
  const mains = real.missions;

  it("names no main mission past the current one but the next gate", () => {
    for (const current of mains) {
      const view = homeView(real, current.slug, new Set(), []);
      const json = JSON.stringify(view);
      const gate = nextGate(real, current.slug);
      for (const m of mains) {
        if (m.order <= current.order || m.slug === gate?.mission) continue;
        expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(m.title);
        expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(
          `"${m.slug}"`,
        );
      }
    }
  });

  it("names an optional mission only from its anchor on", () => {
    for (const current of mains) {
      const json = JSON.stringify(homeView(real, current.slug, new Set(), []));
      for (const o of real.optionalMissions) {
        if (o.opensOrder <= current.order) continue;
        expect(json, `${current.slug} leaks ${o.slug}`).not.toContain(o.title);
        expect(json, `${current.slug} leaks ${o.slug}`).not.toContain(
          `"${o.slug}"`,
        );
      }
    }
  });

  it("names no later chapter", () => {
    for (const current of mains) {
      const json = JSON.stringify(homeView(real, current.slug, new Set(), []));
      const reached =
        real.chapters.find((c) => c.slug === current.chapter)?.order ?? 0;
      for (const c of real.chapters.filter((c) => c.order > reached)) {
        expect(json, `${current.slug} leaks ${c.slug}`).not.toContain(c.title);
      }
    }
  });
});
