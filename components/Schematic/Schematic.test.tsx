import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadCurated } from "@/lib/curated-load";
import type { CuratedData } from "@/lib/curated";
import { mapView, type MapRegion } from "@/lib/map";
import { placedData } from "@/lib/test-fixtures/placed";
import { Schematic, SHAPE_SLUGS } from "./Schematic";

const real = loadCurated();
const placed = placedData();
const none = new Set<string>();

const topLevel = (data: CuratedData) =>
  data.areas.filter((a) => a.parent === undefined);

const render = (regions: MapRegion[]) =>
  renderToStaticMarkup(<Schematic regions={regions} />);

/** Every region of `data` as reached, with a badge of `index`. */
const allReached = (data: CuratedData): MapRegion[] =>
  topLevel(data).map((a, index) => ({
    reached: true,
    index,
    name: a.name,
    href: `/map/${a.slug}`,
    badge: index,
  }));

const allUnreached = (data: CuratedData): MapRegion[] =>
  topLevel(data).map((_, index) => ({ reached: false, index }));

const count = (markup: string, needle: string) =>
  markup.split(needle).length - 1;

describe("Schematic shapes", () => {
  it("has one shape per top-level area, in areas.yaml order", () => {
    expect(SHAPE_SLUGS).toEqual(topLevel(real).map((a) => a.slug));
  });

  it("draws one link per reached region, in index order, to its sheet", () => {
    const markup = render(allReached(real));
    const hrefs = [...markup.matchAll(/<a [^>]*href="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(hrefs).toEqual(topLevel(real).map((a) => `/map/${a.slug}`));
    for (const area of topLevel(real)) expect(markup).toContain(area.name);
  });

  it("makes the Keys chain a single link", () => {
    const markup = render(allReached(real));
    expect(count(markup, 'href="/map/leonida-keys"')).toBe(1);
  });

  it("labels a link with the name and the count, or the name alone at zero", () => {
    const markup = render(allReached(real));
    expect(markup).toContain('aria-label="Port Gellhorn, 3 to do"');
    expect(markup).toContain('aria-label="Vice City"');
    expect(markup).not.toContain("Vice City, 0 to do");
  });

  it("draws a badge only for a region with something to do", () => {
    const regions = allReached(real);
    expect(count(render(regions), "<circle")).toBe(regions.length - 1);
    const zeroed = regions.map((r) => ({ ...r, badge: 0 }) as MapRegion);
    expect(count(render(zeroed), "<circle")).toBe(0);
  });
});

describe("Schematic hides what is not reached", () => {
  const markup = render(allUnreached(real));

  it("draws every region but no link, text or label", () => {
    expect(count(markup, "<a")).toBe(0);
    expect(count(markup, "<text")).toBe(0);
    expect(count(markup, "<circle")).toBe(0);
    expect(count(markup, "<title")).toBe(0);
    expect(count(markup, 'aria-hidden="true"')).toBe(topLevel(real).length);
  });

  it("carries no area name or slug", () => {
    for (const area of topLevel(real)) {
      expect(markup).not.toContain(area.name);
      expect(markup).not.toContain(area.slug);
    }
  });
});

describe("Schematic on the fixture with later areas", () => {
  it("names no later area at any mission, and keeps one shape per region", () => {
    for (const mission of placed.missions) {
      const regions = mapView(placed, mission.slug, none).regions;
      const markup = render(regions);
      expect(count(markup, "<path"), mission.slug).toBe(regions.length);
      for (const region of regions) {
        if (region.reached) continue;
        const area = topLevel(placed)[region.index];
        for (const text of [area.name, area.slug, ...(area.aliases ?? [])]) {
          expect(markup, `${mission.slug}: ${text}`).not.toContain(text);
        }
      }
    }
  });
});
