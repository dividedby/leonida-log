import type { CuratedData, Gate, Item } from "./curated";

/**
 * Spoiler gating. Pure functions over CuratedData; the only gate input is the
 * current mission (the one the user is on: reached, not completed).
 *
 * Naming rules (ADR 0002): nothing here returns a mission title. Callers look
 * titles up with missionTitle() and may show only
 *  - the current mission and earlier ones,
 *  - the next gate's mission (ExitSign),
 *  - a locked summary's unlockMission (LockedRow),
 *  - the one mission the user picks in the picker.
 * Slugs are internal ids and must not be rendered.
 */

const orderIndexes = new WeakMap<CuratedData, Map<string, number>>();

function orderOf(data: CuratedData, mission: string): number {
  let index = orderIndexes.get(data);
  if (!index) {
    index = new Map(data.missions.map((m) => [m.slug, m.order]));
    orderIndexes.set(data, index);
  }
  const order = index.get(mission);
  if (order === undefined) throw new Error(`Unknown mission "${mission}"`);
  return order;
}

/** An item shows once the user has reached its visible_after_mission. */
export function isVisible(
  data: CuratedData,
  item: Item,
  current: string,
): boolean {
  return orderOf(data, item.visible_after_mission) <= orderOf(data, current);
}

/**
 * The first gate not yet passed. A gate you are standing on is not passed
 * until you move on from it. Null after the last gate.
 */
export function nextGate(data: CuratedData, current: string): Gate | null {
  const currentOrder = orderOf(data, current);
  return data.gates.find((g) => g.order >= currentOrder) ?? null;
}

export interface LockedSummary {
  count: number;
  /** The earliest mission that unlocks one of the locked items; null when none are locked. */
  unlockMission: string | null;
}

/** Hidden items for a gate. Content stays hidden; only the count and unlock mission show. */
export function lockedSummary(
  data: CuratedData,
  gate: Gate,
  current: string,
): LockedSummary {
  const currentOrder = orderOf(data, current);
  let count = 0;
  let unlockOrder = Infinity;
  let unlockMission: string | null = null;
  for (const item of data.items) {
    if (item.before_gate !== gate.mission) continue;
    const visibleOrder = orderOf(data, item.visible_after_mission);
    if (visibleOrder <= currentOrder) continue;
    count++;
    if (visibleOrder < unlockOrder) {
      unlockOrder = visibleOrder;
      unlockMission = item.visible_after_mission;
    }
  }
  return { count, unlockMission };
}

export interface PickerMission {
  slug: string;
  /** Global order. */
  order: number;
  /** 1-based number inside the chapter. */
  number: number;
}

/** A chapter's missions by number only. Titles are looked up for the one the user picks. */
export function missionsInChapter(
  data: CuratedData,
  chapter: string,
): PickerMission[] {
  if (!data.chapters.some((c) => c.slug === chapter)) {
    throw new Error(`Unknown chapter "${chapter}"`);
  }
  return data.missions
    .filter((m) => m.chapter === chapter)
    .map((m) => ({ slug: m.slug, order: m.order, number: m.chapterOrder }));
}

export function missionTitle(data: CuratedData, mission: string): string {
  const found = data.missions.find((m) => m.slug === mission);
  if (!found) throw new Error(`Unknown mission "${mission}"`);
  return found.title;
}

export interface PickerChapter {
  slug: string;
  order: number;
  /** Null until the chapter is reached; the UI then shows "Chapter N". */
  name: string | null;
}

/** All chapters; a chapter's name shows only up to the current mission's chapter. */
export function pickerChapters(
  data: CuratedData,
  current: string | null,
): PickerChapter[] {
  let reached = 0;
  if (current !== null) {
    const order = orderOf(data, current);
    const mission = data.missions.find((m) => m.order === order);
    reached =
      data.chapters.find((c) => c.slug === mission?.chapter)?.order ?? 0;
  }
  return data.chapters.map((c) => ({
    slug: c.slug,
    order: c.order,
    name: c.order <= reached ? c.title : null,
  }));
}
