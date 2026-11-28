import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabBar, type Tab } from "./TabBar";

const links = (active: Tab) =>
  [
    ...renderToStaticMarkup(<TabBar active={active} />).matchAll(
      /<a ([^>]*)>(?:<svg.*?<\/svg>)?([^<]+)<\/a>/g,
    ),
  ].map(([, attrs, label]) => ({
    label,
    href: /href="([^"]+)"/.exec(attrs)?.[1],
    current: attrs.includes('aria-current="page"'),
  }));

describe("TabBar", () => {
  it("has five tabs: Story, Checklist, Map, Stats, More", () => {
    expect(links("story").map((l) => [l.label, l.href])).toEqual([
      ["Story", "/"],
      ["Checklist", "/checklist"],
      ["Map", "/map"],
      ["Stats", "/stats"],
      ["More", "/more"],
    ]);
  });

  it.each([
    { active: "story", label: "Story" },
    { active: "checklist", label: "Checklist" },
    { active: "map", label: "Map" },
    { active: "stats", label: "Stats" },
    { active: "more", label: "More" },
  ] as const)("marks only $label current when it is active", (c) => {
    expect(
      links(c.active)
        .filter((l) => l.current)
        .map((l) => l.label),
    ).toEqual([c.label]);
  });
});
