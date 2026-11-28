import type { Area, CuratedData } from "../curated";

/**
 * Test helper for the area text rule (ADR 0010): curated text must not name an
 * area before the area is visible at the point the text can show.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** True when `text` contains the area's name or an alias as whole words, ignoring case and punctuation. */
export function namesArea(text: string, area: Area): boolean {
  const padded = ` ${norm(text)} `;
  return [area.name, ...(area.aliases ?? [])].some((variant) =>
    padded.includes(` ${norm(variant)} `),
  );
}

/**
 * Every place where curated text names an area earlier than the area is
 * visible. The earliest mission each kind of text can show at:
 *  - item title/how_to/location: its visible_after_mission,
 *  - optional mission title/note: its opens_after anchor,
 *  - chapter name: the chapter's first mission,
 *  - main mission title and gate `lost` entry: the first mission (a title can
 *    show as the unlock mission or next gate before it is reached, and the
 *    first gate shows from the start).
 */
export function areaTextLeaks(data: CuratedData): string[] {
  const order = new Map(data.missions.map((m) => [m.slug, m.order]));
  const orderOf = (slug: string) => order.get(slug) ?? 0;
  const leaks: string[] = [];
  const check = (where: string, text: string, showsAt: number) => {
    for (const area of data.areas) {
      if (
        orderOf(area.visible_after_mission) > showsAt &&
        namesArea(text, area)
      ) {
        leaks.push(`${where} names ${area.name}`);
      }
    }
  };

  for (const item of data.items) {
    check(
      `item ${item.id}`,
      `${item.title} ${item.how_to} ${item.location ?? ""}`,
      orderOf(item.visible_after_mission),
    );
  }
  for (const o of data.optionalMissions) {
    check(`optional ${o.slug}`, `${o.title} ${o.note ?? ""}`, o.opensOrder);
  }
  for (const m of data.missions) check(`mission ${m.slug}`, m.title, 1);
  for (const c of data.chapters) {
    const first = data.missions.find((m) => m.chapter === c.slug);
    check(`chapter ${c.slug}`, c.title, first?.order ?? 1);
  }
  for (const gate of data.gates) {
    for (const entry of gate.lost) {
      check(`gate ${gate.mission} lost "${entry}"`, entry, 1);
    }
  }
  return leaks;
}
