import type { CuratedData } from "./curated";
import { gateAt, missionTitle, nextMission } from "./gates";
import { gateChecklist } from "./home";

/**
 * Marking the current mission done (docs/design.md, Flow 3). The form carries
 * the current mission's global order (`from`), never a slug, so a stale or
 * double-submitted form is a harmless no-op instead of a second step.
 */

export interface DoneView {
  /** The current mission: reached, so its title may show. */
  title: string;
  /** Moving on from here crosses a point of no return. */
  isGate: boolean;
  /** What the gate loses; only filled at a gate. */
  lost: string[];
  /** The gate's unticked rows that can still be done. */
  unticked: number;
  isLast: boolean;
}

export function doneView(
  data: CuratedData,
  current: string,
  checked: Set<string>,
): DoneView {
  // gateAt throws on an unknown or optional slug.
  const gate = gateAt(data, current);
  const unticked = gate
    ? gateChecklist(data, gate, current).filter(
        (r) => r.closes.state !== "closed" && !checked.has(r.id),
      ).length
    : 0;
  return {
    title: missionTitle(data, current),
    isGate: gate !== null,
    lost: gate ? gate.lost : [],
    unticked,
    isLast: nextMission(data, current) === null,
  };
}

export type AdvanceTarget =
  | { action: "advance"; to: string; crossesGate: boolean }
  | { action: "stale" }
  | { action: "none" };

/**
 * Where a submitted "mark done" goes. `fromOrder` is the global order the form
 * was rendered for: another value means the position moved since, so nothing
 * happens. Digits only; anything else throws a generic error.
 */
export function advanceTarget(
  data: CuratedData,
  current: string,
  fromOrder: string | null,
): AdvanceTarget {
  if (fromOrder === null || !/^[0-9]+$/.test(fromOrder)) {
    throw new Error("Invalid request");
  }
  const gate = gateAt(data, current);
  const order = data.missions.find((m) => m.slug === current)?.order;
  if (Number(fromOrder) !== order) return { action: "stale" };
  const to = nextMission(data, current);
  if (to === null) return { action: "none" };
  return { action: "advance", to, crossesGate: gate !== null };
}

export type DoneControl = { mode: "advance" | "confirm"; from: number };

/**
 * What the "Mark mission done" control does: one tap (`advance`), a detour
 * through the confirmation (`confirm`, at a gate) or nothing (null, on the
 * last mission).
 */
export function doneControl(
  data: CuratedData,
  current: string,
): DoneControl | null {
  const gate = gateAt(data, current);
  const from = data.missions.find((m) => m.slug === current)?.order;
  if (from === undefined || nextMission(data, current) === null) return null;
  return { mode: gate ? "confirm" : "advance", from };
}

export type DonePage = "/" | "/checklist";

/** Where to land after marking done: the checklist after a gate, else the page it came from. */
export function afterMarkDone(
  crossesGate: boolean,
  returnTo: string | null,
): DonePage {
  if (crossesGate) return "/checklist";
  return returnTo === "/checklist" ? "/checklist" : "/";
}

export function untickedCopy(unticked: number): string {
  if (unticked === 0) return "Everything you can still do is ticked.";
  return unticked === 1
    ? "1 item on your list isn't ticked yet."
    : `${unticked} items on your list aren't ticked yet.`;
}
