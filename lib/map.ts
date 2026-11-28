import {
  checklistView,
  filterSection,
  section,
  type ChecklistSection,
} from "./checklist";
import type { Area, CuratedData } from "./curated";
import { isAreaVisible, missionTitle, nextGate } from "./gates";

/**
 * View models for the Map screen and the area sheet (ADR 0010). Pages only
 * render them. Both are built on the rows of `checklistView`'s sections (all
 * but "No longer available"), so counts, chips and ticks match the checklist.
 *
 * An unreached region is identified only by its `index`: its position among
 * the top-level areas (no `parent`) in areas.yaml file order. It carries no
 * name, slug or href, and no count of any kind, so the map can't say where
 * hidden content is. The schematic draws one shape per region in that order,
 * so a new region goes at the end of areas.yaml, never in the middle.
 */

export type MapRegion =
  | {
      reached: true;
      index: number;
      name: string;
      href: string;
      /** Unticked rows on the region's sheet, districts included. */
      badge: number;
    }
  | { reached: false; index: number };

export interface MapView {
  header: {
    /** "Before <next gate>"; absent after the last gate. */
    eyebrow?: string;
    title: "Map";
  };
  regions: MapRegion[];
  /** Rows with no area; null when there are none. */
  anywhere: ChecklistSection | null;
}

export interface AreaSheet {
  header: {
    name: string;
    /** Unticked rows shown; the region's badge. */
    left: number;
    done: number;
    total: number;
  };
  /** The checklist's grouping and order, empty sections dropped. */
  sections: ChecklistSection[];
}

/** The checklist's sections without the closed, unticked rows. */
function mapSections(
  data: CuratedData,
  current: string,
  checks: Set<string>,
): ChecklistSection[] {
  return checklistView(data, current, checks).sections.filter(
    (s) => s.key !== "gone",
  );
}

/** The sheet for `area`, holding the rows placed in it or its districts. */
function sheetFor(
  data: CuratedData,
  sections: ChecklistSection[],
  area: Area,
): AreaSheet {
  const placed = new Set([
    area.slug,
    ...data.areas.filter((a) => a.parent === area.slug).map((a) => a.slug),
  ]);
  const own = sections
    .map((s) =>
      filterSection(s, (r) => r.area !== undefined && placed.has(r.area.slug)),
    )
    .filter((s) => s.total > 0);
  const rows = own.flatMap((s) => s.rows);
  const done = rows.filter((r) => r.checked).length;
  return {
    header: {
      name: area.name,
      left: rows.length - done,
      done,
      total: rows.length,
    },
    sections: own,
  };
}

export function mapView(
  data: CuratedData,
  current: string,
  checks: Set<string>,
): MapView {
  const sections = mapSections(data, current, checks);
  const gate = nextGate(data, current);
  const regions = data.areas
    .filter((a) => a.parent === undefined)
    .map((area, index): MapRegion => {
      if (!isAreaVisible(data, area, current)) return { reached: false, index };
      return {
        reached: true,
        index,
        name: area.name,
        href: `/map/${area.slug}`,
        badge: sheetFor(data, sections, area).header.left,
      };
    });
  const unplaced = sections
    .flatMap((s) => s.rows)
    .filter((r) => r.area === undefined);
  return {
    header: {
      ...(gate && { eyebrow: `Before ${missionTitle(data, gate.mission)}` }),
      title: "Map",
    },
    regions,
    anywhere:
      unplaced.length > 0 ? section("anywhere", "Anywhere", unplaced) : null,
  };
}

/**
 * The sheet for a region or district; null for an unknown slug, an area not
 * yet visible, or a district whose region is not visible, so the route can't
 * tell them apart.
 */
export function areaSheet(
  data: CuratedData,
  current: string,
  checks: Set<string>,
  slug: string,
): AreaSheet | null {
  const sections = mapSections(data, current, checks);
  const area = data.areas.find((a) => a.slug === slug);
  if (!area || !isAreaVisible(data, area, current)) return null;
  const parent =
    area.parent === undefined
      ? undefined
      : data.areas.find((a) => a.slug === area.parent);
  if (parent && !isAreaVisible(data, parent, current)) return null;
  return sheetFor(data, sections, area);
}
