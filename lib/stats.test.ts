import { describe, expect, it } from "vitest";
import { parseStatLevelInput, statsView } from "./stats";

function form(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseStatLevelInput", () => {
  it.each([0, 1, 2, 3, 4])("accepts level %i", (level) => {
    expect(
      parseStatLevelInput(
        form({ character: "lucia", stat: "focus", level: String(level) }),
      ),
    ).toEqual({ character: "lucia", stat: "focus", level });
  });

  it.each([
    { name: "level 5", fields: { level: "5" } },
    { name: "a negative level", fields: { level: "-1" } },
    { name: "a fractional level", fields: { level: "2.5" } },
    { name: "an exponent level", fields: { level: "1e0" } },
    { name: "a padded level", fields: { level: "02" } },
    { name: "a signed level", fields: { level: "+1" } },
    { name: "a blank level", fields: { level: "" } },
    { name: "a spaced level", fields: { level: " 1" } },
    { name: "an unknown character", fields: { character: "kat" } },
    { name: "a wrong-case character", fields: { character: "Jason" } },
    { name: "an unknown stat", fields: { stat: "driving" } },
    { name: "a blank stat", fields: { stat: "" } },
    {
      name: "a file instead of a level",
      fields: { level: new Blob(["1"]) },
    },
  ])("rejects $name", ({ fields }) => {
    const base = { character: "jason", stat: "strength", level: "1" };
    expect(parseStatLevelInput(form({ ...base, ...fields }))).toBeNull();
  });

  it.each(["character", "stat", "level"])("rejects a missing %s", (name) => {
    const fd = form({ character: "jason", stat: "strength", level: "1" });
    fd.delete(name);
    expect(parseStatLevelInput(fd)).toBeNull();
  });
});

describe("statsView", () => {
  it("lists Jason then Lucia with Strength, Cardio, Focus", () => {
    const view = statsView([]);
    expect(view.map((c) => c.name)).toEqual(["Jason", "Lucia"]);
    expect(view.map((c) => c.character)).toEqual(["jason", "lucia"]);
    for (const card of view) {
      expect(card.stats.map((s) => [s.stat, s.label])).toEqual([
        ["strength", "Strength"],
        ["cardio", "Cardio"],
        ["focus", "Focus"],
      ]);
    }
  });

  it("takes levels from the rows and defaults a missing one to 0", () => {
    const view = statsView([
      { character: "lucia", stat: "focus", level: 4 },
      { character: "jason", stat: "cardio", level: 2 },
    ]);
    expect(view[0].stats.map((s) => s.level)).toEqual([0, 2, 0]);
    expect(view[1].stats.map((s) => s.level)).toEqual([0, 0, 4]);
  });

  it("offers levels 0 to 4 and marks only the current one", () => {
    const [jason] = statsView([
      { character: "jason", stat: "strength", level: 3 },
    ]);
    expect(jason.stats[0].options).toEqual([
      { level: 0, current: false },
      { level: 1, current: false },
      { level: 2, current: false },
      { level: 3, current: true },
      { level: 4, current: false },
    ]);
    expect(jason.stats[1].options[0]).toEqual({ level: 0, current: true });
  });
});
