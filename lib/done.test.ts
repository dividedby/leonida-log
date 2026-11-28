import { describe, expect, it } from "vitest";
import { loadCurated } from "./curated-load";
import {
  advanceTarget,
  afterMarkDone,
  doneControl,
  doneView,
  untickedCopy,
} from "./done";
import { fixtureData } from "./test-fixtures/curated";

const data = fixtureData();
const real = loadCurated();

// Fixture: missions m1..m8 have global orders 1..8; gates at m3 and m7.
// Gate m3 rows: a (m1), b (m2, closes m3), c (m3), o1 and o2 (close m3).
describe("doneView", () => {
  it("is not a gate between gates, and lists nothing lost", () => {
    expect(doneView(data, "m2", new Set())).toEqual({
      title: "Mission m2",
      isGate: false,
      lost: [],
      unticked: 0,
      isLast: false,
    });
  });

  it("at a gate lists what is lost", () => {
    expect(doneView(data, "m3", new Set())).toMatchObject({
      title: "Mission m3",
      isGate: true,
      lost: ["Thing one"],
    });
  });

  it("counts the gate's unticked rows that can still be done", () => {
    // at m3: a, c open; b closed and not counted; optionals have closed
    expect(doneView(data, "m3", new Set()).unticked).toBe(2);
    expect(doneView(data, "m3", new Set(["a"])).unticked).toBe(1);
    expect(doneView(data, "m3", new Set(["a", "c"])).unticked).toBe(0);
  });

  it("flags the last mission", () => {
    expect(doneView(data, "m8", new Set()).isLast).toBe(true);
  });

  it("throws on an unknown or optional current mission", () => {
    expect(() => doneView(data, "nope", new Set())).toThrow(/nope/);
    expect(() => doneView(data, "o1", new Set())).toThrow(/o1/);
  });
});

describe("advanceTarget", () => {
  it("advances to the next mission when from matches", () => {
    expect(advanceTarget(data, "m1", "1")).toEqual({
      action: "advance",
      to: "m2",
      crossesGate: false,
    });
  });

  it("flags crossing a gate only when standing on one", () => {
    expect(advanceTarget(data, "m3", "3")).toMatchObject({
      action: "advance",
      to: "m4",
      crossesGate: true,
    });
    expect(advanceTarget(data, "m4", "4")).toMatchObject({
      crossesGate: false,
    });
  });

  it.each([
    { name: "an earlier mission", from: "2" },
    { name: "a later mission", from: "5" },
    { name: "a number past the list", from: "99" },
    { name: "a number with leading zeros", from: "02" },
  ])("is stale when from is $name", ({ from }) => {
    expect(advanceTarget(data, "m3", from)).toEqual({ action: "stale" });
  });

  it("does nothing on the last mission", () => {
    expect(advanceTarget(data, "m8", "8")).toEqual({ action: "none" });
  });

  it("reports stale before none when from is out of date at the last mission", () => {
    expect(advanceTarget(data, "m8", "7")).toEqual({ action: "stale" });
  });

  it.each([
    { name: "missing", from: null },
    { name: "empty", from: "" },
    { name: "text", from: "m3" },
    { name: "signed", from: "-3" },
    { name: "fractional", from: "3.0" },
    { name: "padded", from: " 3" },
  ])("throws a generic error when from is $name", ({ from }) => {
    expect(() => advanceTarget(data, "m3", from)).toThrow("Invalid request");
  });
});

describe("doneControl", () => {
  it.each([
    { name: "first", current: "m1", expected: { mode: "advance", from: 1 } },
    { name: "middle", current: "m4", expected: { mode: "advance", from: 4 } },
    { name: "a gate", current: "m3", expected: { mode: "confirm", from: 3 } },
    { name: "the last", current: "m8", expected: null },
  ])("$name", ({ current, expected }) => {
    expect(doneControl(data, current)).toEqual(expected);
  });
});

describe("afterMarkDone", () => {
  it.each([
    {
      name: "crossing a gate",
      crosses: true,
      back: "/",
      expected: "/checklist",
    },
    { name: "from Home", crosses: false, back: "/", expected: "/" },
    {
      name: "from the checklist",
      crosses: false,
      back: "/checklist",
      expected: "/checklist",
    },
    { name: "an unlisted page", crosses: false, back: "/stats", expected: "/" },
    {
      name: "an external URL",
      crosses: false,
      back: "https://x.test",
      expected: "/",
    },
    { name: "no value", crosses: false, back: null, expected: "/" },
  ])("$name goes to $expected", ({ crosses, back, expected }) => {
    expect(afterMarkDone(crosses, back)).toBe(expected);
  });
});

describe("untickedCopy", () => {
  it.each([
    { n: 0, copy: "Everything you can still do is ticked." },
    { n: 1, copy: "1 item on your list isn't ticked yet." },
    { n: 4, copy: "4 items on your list aren't ticked yet." },
  ])("$n", ({ n, copy }) => {
    expect(untickedCopy(n)).toBe(copy);
  });
});

describe("done leaks (real data)", () => {
  const mains = real.missions;

  it("doneView names no mission past the current one", () => {
    for (const current of mains) {
      const json = JSON.stringify(doneView(real, current.slug, new Set()));
      for (const m of mains) {
        if (m.order <= current.order) continue;
        expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(m.title);
        expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(
          `"${m.slug}"`,
        );
      }
    }
  });

  it("doneControl carries only the current mission's own order", () => {
    for (const current of mains) {
      const control = doneControl(real, current.slug);
      expect(control === null || control.from === current.order).toBe(true);
    }
  });

  it("advanceTarget moves exactly one mission, and only for the matching from", () => {
    for (const current of mains) {
      const next = mains.find((m) => m.order === current.order + 1);
      const result = advanceTarget(real, current.slug, String(current.order));
      if (next) {
        expect(result).toMatchObject({ action: "advance", to: next.slug });
      } else {
        expect(result).toEqual({ action: "none" });
      }
      expect(
        advanceTarget(real, current.slug, String(current.order + 1)),
      ).toEqual({ action: "stale" });
    }
  });
});
