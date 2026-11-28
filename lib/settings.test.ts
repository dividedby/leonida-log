import { describe, expect, it } from "vitest";
import { THEMES } from "./db/schema";
import { parseTheme, settingsView, themeAttribute } from "./settings";

function form(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseTheme", () => {
  it.each(THEMES)("accepts %s", (theme) => {
    expect(parseTheme(form({ theme }))).toBe(theme);
  });

  it.each([
    { name: "an unknown theme", value: "sepia" },
    { name: "a wrong-case theme", value: "Dark" },
    { name: "a blank theme", value: "" },
    { name: "a padded theme", value: " dark" },
    { name: "a file", value: new Blob(["dark"]) },
  ])("rejects $name", ({ value }) => {
    expect(parseTheme(form({ theme: value }))).toBeNull();
  });

  it("rejects a missing theme", () => {
    expect(parseTheme(new FormData())).toBeNull();
  });
});

describe("themeAttribute", () => {
  it.each([
    { theme: "light", attribute: "light" },
    { theme: "dark", attribute: "dark" },
    { theme: "system", attribute: undefined },
  ] as const)("$theme sets $attribute", ({ theme, attribute }) => {
    expect(themeAttribute(theme)).toBe(attribute);
  });
});

describe("settingsView", () => {
  it.each(THEMES)("flags only %s as selected", (theme) => {
    const options = settingsView(theme);
    expect(options.map((o) => o.value)).toEqual(["system", "light", "dark"]);
    expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual([
      theme,
    ]);
  });

  it("labels the options", () => {
    expect(settingsView("system").map((o) => o.label)).toEqual([
      "System",
      "Light",
      "Dark",
    ]);
  });
});
