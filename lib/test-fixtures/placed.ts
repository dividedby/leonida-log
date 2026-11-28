import { parseCurated, type CuratedData } from "../curated";
import { fixtureRaw, type FixtureRaw } from "./curated";

/**
 * The fixture with its entries placed on the map. Region r1 (visible m1) holds
 * items a, b, c and optional o1; region r2 (m5) holds item d and optional o4;
 * district d1 (m6, under r2) holds item e. Optionals o2 and o3 stay unplaced
 * (Anywhere). Every placement obeys the curated rules: an area is visible no
 * later than its item or its optional's anchor.
 */
export function placedRaw(): FixtureRaw {
  const raw = fixtureRaw();
  const items = Object.values(raw.itemFiles).flatMap((f) => f.items);
  const place = (list: Record<string, unknown>[], id: string, area: string) => {
    const found = list.find((e) => e.id === id || e.slug === id);
    if (!found) throw new Error(`no fixture entry ${id}`);
    found.area = area;
  };
  for (const [id, area] of [
    ["a", "r1"],
    ["b", "r1"],
    ["c", "r1"],
    ["d", "r2"],
    ["e", "d1"],
  ]) {
    place(items, id, area);
  }
  for (const [id, area] of [
    ["o1", "r1"],
    ["o4", "r2"],
  ]) {
    place(raw.missions.missions, id, area);
  }
  return raw;
}

export function placedData(): CuratedData {
  return parseCurated(placedRaw());
}
