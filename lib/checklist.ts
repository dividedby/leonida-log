import {
  CATEGORIES,
  type Category,
  type Character,
  type CuratedData,
  type Source,
} from "./curated";
import {
  boundGate,
  closesIn,
  countdownLabel,
  isTickable,
  lockedSummary,
  missionTitle,
  nextGate,
  safeToLeave,
  type Countdown,
} from "./gates";
import {
  chipsFor,
  gateChecklist,
  gateProgress,
  type ChecklistRowData,
  type ChipSpec,
} from "./home";

/**
 * View models for the checklist screen and the item detail route. Pages only
 * render them. Titles appear only where ADR 0002 allows: the next gate, the
 * locked row's unlock mission, opened optional missions and visible items.
 */

export interface ChecklistRowView {
  /** Item id or optional mission slug: the key a tick is stored under. */
  id: string;
  title: string;
  checked: boolean;
  /** Empty once ticked: a done row has nothing left to warn about. */
  chips: ChipSpec[];
  href: string;
  /** Past its cutoff and not ticked: it can't be done. */
  disabled: boolean;
}

export interface ChecklistSection {
  key: string;
  title: string;
  done: number;
  total: number;
  rows: ChecklistRowView[];
}

export interface ChecklistView {
  header: { eyebrow?: string; title: string; subtitle: string };
  sections: ChecklistSection[];
  locked: { count: number; unlockTitle: string } | null;
  /** The next gate's lost entries, while it is still ahead. */
  lost: { label: string; entries: string[] } | null;
}

function rowView(
  row: ChecklistRowData,
  checked: Set<string>,
  disabled = false,
): ChecklistRowView {
  const isChecked = checked.has(row.id);
  return {
    id: row.id,
    title: row.title,
    checked: isChecked,
    chips: isChecked ? [] : chipsFor(row.closes),
    href: `/checklist/item/${row.id}`,
    disabled,
  };
}

function section(
  key: string,
  title: string,
  rows: ChecklistRowView[],
): ChecklistSection {
  return {
    key,
    title,
    done: rows.filter((r) => r.checked).length,
    total: rows.length,
    rows,
  };
}

export function checklistView(
  data: CuratedData,
  current: string,
  checked: Set<string>,
): ChecklistView {
  // nextGate throws on an unknown or optional slug.
  const gate = nextGate(data, current);
  const sections: ChecklistSection[] = [];
  let header: ChecklistView["header"] = {
    title: "Before you move on",
    subtitle: "No more points of no return.",
  };
  let locked: ChecklistView["locked"] = null;
  let lost: ChecklistView["lost"] = null;
  const gone: ChecklistRowView[] = [];

  if (gate) {
    const rows = gateChecklist(data, gate, current);
    const { done, total } = gateProgress(rows, checked);
    header = {
      eyebrow: "Before you move on",
      title: missionTitle(data, gate.mission),
      subtitle: `${done} of ${total} done`,
    };

    // An unticked row past its cutoff can't be done; a ticked one stays put
    // so it can be unticked.
    const isGone = (r: ChecklistRowData) =>
      r.closes.state === "closed" && !checked.has(r.id);
    const live = rows.filter((r) => !isGone(r));
    gone.push(...rows.filter(isGone).map((r) => rowView(r, checked, true)));

    for (const category of CATEGORIES) {
      const inCategory = live.filter(
        (r) => r.kind === "item" && r.category === category,
      );
      if (inCategory.length === 0) continue;
      sections.push(
        section(
          `category-${category}`,
          category,
          inCategory.map((r) => rowView(r, checked)),
        ),
      );
    }
    const optionals = live.filter((r) => r.kind === "optional");
    if (optionals.length > 0) {
      sections.push(
        section(
          "optional",
          "Optional missions",
          optionals.map((r) => rowView(r, checked)),
        ),
      );
    }

    const summary = lockedSummary(data, gate, current);
    if (summary.count > 0 && summary.unlockMission !== null) {
      locked = {
        count: summary.count,
        unlockTitle: missionTitle(data, summary.unlockMission),
      };
    }

    const closes = closesIn(data, current, gate.mission);
    const label = countdownLabel(closes);
    if (label !== null) lost = { label, entries: gate.lost };
  }

  const safe = safeToLeave(data, current).map((o): ChecklistRowData => ({
    id: o.slug,
    kind: "optional",
    title: o.title,
    closes: { state: "never" },
  }));
  if (safe.length > 0) {
    sections.push(
      section(
        "safe",
        "Safe to leave",
        safe.map((r) => rowView(r, checked)),
      ),
    );
  }
  if (gone.length > 0) {
    sections.push(section("gone", "No longer available", gone));
  }

  return { header, sections, locked, lost };
}

export type ItemDetail =
  | {
      kind: "item";
      title: string;
      category: Category;
      howTo: string;
      location?: string;
      sources: { title: string; url: string }[];
      closes: Countdown;
    }
  | {
      kind: "optional";
      title: string;
      note?: string;
      character: Character;
      sources: { title: string; url: string }[];
      closes: Countdown;
    };

/** Lowercase, apostrophes dropped, every other run of characters one "-": titles and links compare alike. */
function slugified(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-");
}

/**
 * Source titles and links come from outside and can name a mission the item's
 * own text may not ("IGN: Feng Shui walkthrough"). A source that names a main
 * mission after `current` is withheld; the entry's own gate may be named, as
 * in its text (ADR 0002).
 */
function safeSources(
  data: CuratedData,
  current: string,
  ownGate: string | null,
  list: Source[],
): { title: string; url: string }[] {
  const currentOrder =
    data.missions.find((m) => m.slug === current)?.order ?? Infinity;
  const later = data.missions.filter(
    (m) => m.order > currentOrder && m.slug !== ownGate,
  );
  // A slug can differ from the slugified title (it spells an older title), so
  // match both; slugs only as whole "-" separated words.
  const titles = later.map((m) => slugified(m.title));
  const slugs = later.map((m) => `-${m.slug}-`);
  return list
    .filter(({ title, url }) => {
      const text = `${slugified(title)} ${slugified(url)}`;
      const words = `-${text.replaceAll(" ", "-")}-`;
      return (
        !titles.some((name) => text.includes(name)) &&
        !slugs.some((slug) => words.includes(slug))
      );
    })
    .map(({ title, url }) => ({ title, url }));
}

/**
 * The detail sheet for a visible item or an opened optional mission; null for
 * anything hidden or unknown, so the route can't reach content past the
 * current mission. Curated fields only: no research background, no scraped data.
 */
export function itemDetail(
  data: CuratedData,
  id: string,
  current: string,
): ItemDetail | null {
  if (!isTickable(data, id, current)) return null;

  const item = data.items.find((i) => i.id === id);
  if (item) {
    return {
      kind: "item",
      title: item.title,
      category: item.category,
      howTo: item.how_to,
      ...(item.location !== undefined && { location: item.location }),
      sources: safeSources(data, current, item.before_gate, item.sources),
      closes: closesIn(data, current, item.lost_at_mission ?? "never"),
    };
  }
  const optional = data.optionalMissions.find((o) => o.slug === id);
  if (!optional) return null;
  return {
    kind: "optional",
    title: optional.title,
    ...(optional.note !== undefined && { note: optional.note }),
    character: optional.character,
    sources: safeSources(
      data,
      current,
      boundGate(data, optional)?.mission ?? null,
      optional.sources,
    ),
    closes: closesIn(data, current, optional.closesAt),
  };
}
