import { describe, expect, it } from "vitest";
import { loadCurated } from "./curated-load";
import { missionFromOrder, pickerView } from "./picker";
import { fixtureData } from "./test-fixtures/curated";

const data = fixtureData();
const real = loadCurated();

describe("pickerView, chapter step", () => {
  it("names no chapter on first run", () => {
    expect(pickerView(data, null, {})).toEqual({
      step: "chapter",
      chapters: [
        { order: 1, label: "Chapter 1" },
        { order: 2, label: "Chapter 2" },
      ],
    });
  });

  it.each([
    { current: "m4", labels: ["Chapter 1 · First Chapter", "Chapter 2"] },
    {
      current: "m5",
      labels: ["Chapter 1 · First Chapter", "Chapter 2 · Second Chapter"],
    },
  ])("names chapters only up to $current", ({ current, labels }) => {
    const view = pickerView(data, current, {});
    expect(
      view.step === "chapter" && view.chapters.map((c) => c.label),
    ).toEqual(labels);
  });

  it.each([{ chapter: 99 }, { chapter: 0 }, { chapter: -1 }, { chapter: 1.5 }])(
    "falls back to the chapter step for chapter $chapter",
    (sel) => {
      expect(pickerView(data, null, sel).step).toBe("chapter");
    },
  );
});

describe("pickerView, mission step", () => {
  it("lists the chapter's missions by number and global order", () => {
    expect(pickerView(data, null, { chapter: 2 })).toEqual({
      step: "mission",
      chapter: { order: 2, label: "Chapter 2" },
      missions: [
        { order: 5, number: 1, selected: false },
        { order: 6, number: 2, selected: false },
        { order: 7, number: 3, selected: false },
        { order: 8, number: 4, selected: false },
      ],
      selected: null,
    });
  });

  it("shows the title of the selected mission only", () => {
    const view = pickerView(data, null, { chapter: 2, mission: 6 });
    expect(view).toMatchObject({
      step: "mission",
      selected: { order: 6, number: 2, title: "Mission m6" },
    });
    expect(view.step === "mission" && view.missions[1].selected).toBe(true);
    const json = JSON.stringify(view);
    for (const m of data.missions.filter((m) => m.order !== 6)) {
      expect(json).not.toContain(m.title);
    }
  });

  it("names the chosen chapter only when reached", () => {
    const reached = pickerView(data, "m6", { chapter: 2 });
    expect(reached).toMatchObject({
      chapter: { label: "Chapter 2 · Second Chapter" },
    });
    expect(pickerView(data, "m2", { chapter: 2 })).toMatchObject({
      chapter: { label: "Chapter 2" },
    });
  });

  it.each([
    { name: "outside the chapter", mission: 2 },
    { name: "past the end", mission: 99 },
    { name: "zero", mission: 0 },
    { name: "fractional", mission: 5.5 },
  ])("selects nothing for a mission number $name", ({ mission }) => {
    const view = pickerView(data, null, { chapter: 2, mission });
    expect(view).toMatchObject({ step: "mission", selected: null });
    expect(JSON.stringify(view)).not.toMatch(/Mission m/);
  });
});

describe("pickerView leaks (real data)", () => {
  const titles = real.missions.map((m) => m.title);
  const slugs = [
    ...real.missions.map((m) => m.slug),
    ...real.chapters.map((c) => c.slug),
  ];

  it("names nothing but the selected mission, whichever one is selected", () => {
    for (const picked of real.missions) {
      const chapter = real.chapters.find((c) => c.slug === picked.chapter);
      const json = JSON.stringify(
        pickerView(real, null, {
          chapter: chapter?.order,
          mission: picked.order,
        }),
      );
      for (const title of titles) {
        if (title !== picked.title) expect(json).not.toContain(title);
      }
      for (const slug of slugs) expect(json).not.toContain(slug);
      for (const c of real.chapters) expect(json).not.toContain(c.title);
    }
  });

  it("names no chapter on first run, and no slug at the chapter step", () => {
    const json = JSON.stringify(pickerView(real, null, {}));
    for (const c of real.chapters) expect(json).not.toContain(c.title);
    for (const slug of slugs) expect(json).not.toContain(slug);
  });

  it("with a current mission names only chapters up to it", () => {
    const current = real.missions.find((m) => m.order === 40);
    if (!current) throw new Error("no mission 40");
    const reached = real.chapters.find((c) => c.slug === current.chapter);
    const json = JSON.stringify(pickerView(real, current.slug, {}));
    for (const c of real.chapters) {
      if (c.order <= (reached?.order ?? 0)) expect(json).toContain(c.title);
      else expect(json).not.toContain(c.title);
    }
  });
});

describe("missionFromOrder", () => {
  it.each([
    { raw: "1", slug: "m1" },
    { raw: "8", slug: "m8" },
  ])("maps order $raw to $slug", ({ raw, slug }) => {
    expect(missionFromOrder(data, raw)).toBe(slug);
  });

  it.each([
    { name: "letters", raw: "abc" },
    { name: "zero", raw: "0" },
    { name: "past the end", raw: "9" },
    { name: "negative", raw: "-1" },
    { name: "empty", raw: "" },
    { name: "missing", raw: null },
    { name: "fractional", raw: "3.5" },
    { name: "padded", raw: " 3" },
    { name: "an exponent", raw: "1e1" },
  ])("rejects $name", ({ raw }) => {
    expect(() => missionFromOrder(data, raw)).toThrow();
  });

  it("does not echo the input in its error", () => {
    expect(() => missionFromOrder(data, "tourist-trap")).toThrow(
      /^(?!.*tourist-trap)/,
    );
  });
});
