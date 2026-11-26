import type { CuratedData, Gate, Item, OptionalMission } from "./curated";

/**
 * Spoiler gating. Pure functions over CuratedData; the only gate input is the
 * current mission (the one the user is on: reached, not completed).
 *
 * The current mission is always a main mission; optional missions never enter
 * the picker or the order.
 *
 * Naming rules (ADR 0002): nothing here returns a mission title. Callers look
 * titles up with missionTitle() and may show only
 *  - the current mission and earlier ones,
 *  - the next gate's mission (ExitSign),
 *  - a locked summary's unlockMission (LockedRow, always a main mission),
 *  - the one mission the user picks in the picker,
 *  - an optional mission's own title, from its opens_after anchor on
 *    (gateOptionals and safeToLeave only return opened ones).
 * Cutoffs are shown as a countdown (closesIn, countdownLabel), never by name.
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
  if (order === undefined) {
    const optional = data.optionalMissions.some((o) => o.slug === mission);
    throw new Error(
      optional
        ? `"${mission}" is an optional mission, not a main mission`
        : `Unknown mission "${mission}"`,
    );
  }
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

export type Countdown =
  | { state: "open"; missions: number }
  | { state: "closed" }
  | { state: "never" };

/**
 * How far off a cutoff is. `current` is reached, not completed, so standing on
 * the closing mission counts as closed. `closesAt` is a main mission slug or
 * "never"; it works for an item's lost_at_mission and a gate's mission too.
 */
export function closesIn(
  data: CuratedData,
  current: string,
  closesAt: string,
): Countdown {
  const currentOrder = orderOf(data, current);
  if (closesAt === "never") return { state: "never" };
  const missions = orderOf(data, closesAt) - currentOrder;
  return missions >= 1 ? { state: "open", missions } : { state: "closed" };
}

/** UI copy for a countdown; null when there is nothing to show. Names no mission. */
export function countdownLabel(countdown: Countdown): string | null {
  if (countdown.state !== "open") return null;
  return countdown.missions === 1
    ? "Do this before your next story mission"
    : `Closes in ${countdown.missions} missions`;
}

/** The first gate at or after an optional's closing mission; null for "never". */
function boundGate(data: CuratedData, optional: OptionalMission): Gate | null {
  if (optional.closesOrder === null) return null;
  const closes = optional.closesOrder;
  return data.gates.find((g) => g.order >= closes) ?? null;
}

export interface GateOptional {
  mission: OptionalMission;
  countdown: Extract<Countdown, { state: "open" }>;
}

/**
 * Optional missions to finish before `gate`: opened (the user reached their
 * anchor) and not yet closed, most urgent first.
 */
export function gateOptionals(
  data: CuratedData,
  gate: Gate,
  current: string,
): GateOptional[] {
  const currentOrder = orderOf(data, current);
  const rows: GateOptional[] = [];
  for (const mission of data.optionalMissions) {
    if (boundGate(data, mission)?.mission !== gate.mission) continue;
    if (mission.opensOrder > currentOrder) continue;
    const countdown = closesIn(data, current, mission.closesAt);
    if (countdown.state === "open") rows.push({ mission, countdown });
  }
  return rows.sort((a, b) => a.countdown.missions - b.countdown.missions);
}

/** Opened optional missions that stay available after the story. */
export function safeToLeave(
  data: CuratedData,
  current: string,
): OptionalMission[] {
  const currentOrder = orderOf(data, current);
  return data.optionalMissions.filter(
    (o) => o.closesAt === "never" && o.opensOrder <= currentOrder,
  );
}

export interface LockedSummary {
  count: number;
  /** The earliest mission that unlocks one of the locked items; null when none are locked. */
  unlockMission: string | null;
}

/**
 * Hidden items and unopened optional missions for a gate. Content stays
 * hidden; only the count and unlock mission (always a main mission: an
 * optional's anchor) show.
 */
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
  for (const optional of data.optionalMissions) {
    if (boundGate(data, optional)?.mission !== gate.mission) continue;
    if (optional.opensOrder <= currentOrder) continue;
    count++;
    if (optional.opensOrder < unlockOrder) {
      unlockOrder = optional.opensOrder;
      unlockMission = optional.opensAnchor;
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
