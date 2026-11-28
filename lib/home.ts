import type { StatStripRow } from "@/components/StatStrip/StatStrip";
import type { Category, CuratedData, Gate } from "./curated";
import {
  closesIn,
  countdownLabel,
  gateOptionals,
  isVisible,
  nextGate,
  safeToLeave,
  type Countdown,
} from "./gates";
import type { StatLevel } from "./db/repository";
import { statsView } from "./stats";

/**
 * View model for Home: everything the screen shows, derived from curated data,
 * the current mission and the user's ticks. The page only renders it. Titles
 * appear only where ADR 0002 allows: reached missions, the next gate, opened
 * optional missions.
 */

/** "Soon lost" shows when a cutoff is this many main missions away or fewer. */
export const SOON_LOST_WITHIN = 3;

export const UP_NEXT_LIMIT = 3;

export interface ChecklistRowData {
  /** Item id or optional mission slug: the key a tick is stored under. */
  id: string;
  kind: "item" | "optional";
  title: string;
  category?: Category;
  closes: Countdown;
}

/**
 * A gate's rows at the current mission: visible items in file order, then
 * opened optional missions. An item past its cutoff stays listed (closed).
 */
export function gateChecklist(
  data: CuratedData,
  gate: Gate,
  current: string,
): ChecklistRowData[] {
  const items = data.items
    .filter(
      (i) => i.before_gate === gate.mission && isVisible(data, i, current),
    )
    .map((i): ChecklistRowData => ({
      id: i.id,
      kind: "item",
      title: i.title,
      category: i.category,
      closes:
        i.lost_at_mission === undefined
          ? { state: "never" }
          : closesIn(data, current, i.lost_at_mission),
    }));
  const optionals = gateOptionals(data, gate, current).map(
    ({ mission, countdown }): ChecklistRowData => ({
      id: mission.slug,
      kind: "optional",
      title: mission.title,
      closes: countdown,
    }),
  );
  return [...items, ...optionals];
}

export function gateProgress(
  rows: ChecklistRowData[],
  checked: Set<string>,
): { done: number; total: number } {
  return {
    done: rows.filter((r) => checked.has(r.id)).length,
    total: rows.length,
  };
}

/**
 * Unchecked rows that can still be done: those about to close first (fewest
 * missions left), then the rest in order. Rows past their cutoff are left out.
 */
export function upNext(
  rows: ChecklistRowData[],
  checked: Set<string>,
  limit: number = UP_NEXT_LIMIT,
): ChecklistRowData[] {
  const left = rows.filter(
    (r) => !checked.has(r.id) && r.closes.state !== "closed",
  );
  const missions = (r: ChecklistRowData) =>
    r.closes.state === "open" ? r.closes.missions : Infinity;
  // Array.sort is stable, so equal countdowns keep their list order.
  return left.sort((a, b) => missions(a) - missions(b)).slice(0, limit);
}

export interface ChipSpec {
  variant: "soon-lost" | "countdown";
  text: string;
}

export function chipsFor(closes: Countdown): ChipSpec[] {
  const label = countdownLabel(closes);
  if (label === null || closes.state !== "open") return [];
  const chips: ChipSpec[] = [];
  if (closes.missions <= SOON_LOST_WITHIN) {
    chips.push({ variant: "soon-lost", text: "Soon lost" });
  }
  chips.push({ variant: "countdown", text: label });
  return chips;
}

/** Both characters, all three stats; a stat with no row yet is level 0. */
export function statRows(levels: StatLevel[]): StatStripRow[] {
  return statsView(levels).map(({ name, stats }) => ({
    name,
    stats: stats.map(({ label, level }) => ({ label, level })),
  }));
}

export interface StoryPosition {
  eyebrow: string;
  title: string;
  /** Chapter-relative: mission `number` of `total` in its chapter. */
  position: { number: number; total: number };
}

/**
 * Where the current mission sits, for any screen that shows it. The mission
 * and its chapter are reached, so their names may show. Throws on an unknown
 * or optional slug.
 */
export function storyPosition(
  data: CuratedData,
  current: string,
): StoryPosition {
  const mission = data.missions.find((m) => m.slug === current);
  if (!mission) throw new Error(`Unknown mission "${current}"`);
  const chapter = data.chapters.find((c) => c.slug === mission.chapter);
  if (!chapter) throw new Error(`Unknown chapter "${mission.chapter}"`);
  return {
    eyebrow: `Chapter ${chapter.order} · ${chapter.title}`,
    title: mission.title,
    position: { number: mission.chapterOrder, total: chapter.missionCount },
  };
}

export interface HomeView extends StoryPosition {
  gate: { exit: number; title: string; done: number; total: number } | null;
  upNext: { id: string; title: string; chips: ChipSpec[] }[];
  /** Shown when upNext is empty. */
  emptyMessage: string;
  stats: StatStripRow[];
}

export function homeView(
  data: CuratedData,
  current: string,
  checked: Set<string>,
  levels: StatLevel[],
): HomeView {
  // nextGate throws on an unknown or optional slug.
  const gate = nextGate(data, current);
  const where = storyPosition(data, current);

  let rows: ChecklistRowData[];
  let gateInfo: HomeView["gate"] = null;
  let emptyMessage = "No more points of no return.";
  if (gate) {
    rows = gateChecklist(data, gate, current);
    const gateMission = data.missions.find((m) => m.slug === gate.mission);
    if (!gateMission) throw new Error(`Unknown mission "${gate.mission}"`);
    gateInfo = {
      exit: gateMission.chapterOrder,
      title: gateMission.title,
      ...gateProgress(rows, checked),
    };
    emptyMessage =
      gateInfo.done === gateInfo.total
        ? `All done for Exit ${gateMission.chapterOrder}.`
        : `Nothing left you can still do for Exit ${gateMission.chapterOrder}.`;
  } else {
    rows = safeToLeave(data, current).map((o) => ({
      id: o.slug,
      kind: "optional",
      title: o.title,
      closes: { state: "never" },
    }));
  }

  return {
    ...where,
    gate: gateInfo,
    upNext: upNext(rows, checked).map((r) => ({
      id: r.id,
      title: r.title,
      chips: chipsFor(r.closes),
    })),
    emptyMessage,
    stats: statRows(levels),
  };
}
