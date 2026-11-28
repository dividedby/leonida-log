import { describe, expect, it } from "vitest";
import { loadCurated } from "./curated-load";
import { moreView } from "./more";
import { fixtureData } from "./test-fixtures/curated";

const data = fixtureData();
const real = loadCurated();

describe("moreView", () => {
  it("shows the current chapter, mission and chapter-relative position", () => {
    expect(moreView(data, "m6", "system").story).toEqual({
      eyebrow: "Chapter 2 · Second Chapter",
      title: "Mission m6",
      position: { number: 2, total: 4 },
    });
  });

  it("marks the research sections as in progress, with nothing else", () => {
    expect(moreView(data, "m1", "system").research).toEqual([
      { title: "Romance", status: "Research in progress" },
      { title: "Criminal profile", status: "Research in progress" },
    ]);
  });

  it("passes the theme options through and says spoilers are safe", () => {
    const view = moreView(data, "m1", "dark");
    expect(view.theme.filter((o) => o.selected).map((o) => o.value)).toEqual([
      "dark",
    ]);
    expect(view.spoilers).toBe(
      "Spoilers: safe. Opening later content isn't available in v1.",
    );
  });

  it.each(["nope", "o1"])(
    "throws on the unknown or optional mission %s",
    (slug) => {
      expect(() => moreView(data, slug, "system")).toThrow(slug);
    },
  );
});

describe("moreView leaks (real data)", () => {
  const mains = real.missions;

  it("names no main mission past the current one", () => {
    for (const current of mains) {
      const json = JSON.stringify(moreView(real, current.slug, "system"));
      for (const m of mains) {
        if (m.order <= current.order) continue;
        expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(m.title);
        expect(json, `${current.slug} leaks ${m.slug}`).not.toContain(
          `"${m.slug}"`,
        );
      }
    }
  });

  it("names no optional mission, opened or not", () => {
    for (const current of mains) {
      const json = JSON.stringify(moreView(real, current.slug, "system"));
      for (const o of real.optionalMissions) {
        expect(json, `${current.slug} leaks ${o.slug}`).not.toContain(o.title);
        expect(json, `${current.slug} leaks ${o.slug}`).not.toContain(
          `"${o.slug}"`,
        );
      }
    }
  });

  it("names no later chapter", () => {
    for (const current of mains) {
      const json = JSON.stringify(moreView(real, current.slug, "system"));
      const reached =
        real.chapters.find((c) => c.slug === current.chapter)?.order ?? 0;
      for (const c of real.chapters.filter((c) => c.order > reached)) {
        expect(json, `${current.slug} leaks ${c.slug}`).not.toContain(c.title);
      }
    }
  });
});
