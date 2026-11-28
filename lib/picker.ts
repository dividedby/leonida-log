import type { CuratedData } from "./curated";
import { missionTitle, missionsInChapter, pickerChapters } from "./gates";

/**
 * View model for the story-position picker (docs/design.md, Flow 1). Plain
 * data the page renders as-is. It is addressed by chapter number and global
 * mission order only: slugs spell titles, so none reach the client or a URL.
 * A mission's title appears only for the one the user selected.
 */

export interface PickerSelection {
  chapter?: number;
  /** Global mission order. */
  mission?: number;
}

export type PickerView =
  | {
      step: "chapter";
      chapters: { order: number; label: string }[];
    }
  | {
      step: "mission";
      chapter: { order: number; label: string };
      missions: { order: number; number: number; selected: boolean }[];
      selected: { order: number; number: number; title: string } | null;
    };

/** "Chapter 2", plus the name once the chapter is reached. */
function chapterLabel(order: number, name: string | null): string {
  return name === null ? `Chapter ${order}` : `Chapter ${order} · ${name}`;
}

export function pickerView(
  data: CuratedData,
  current: string | null,
  sel: PickerSelection,
): PickerView {
  const chapters = pickerChapters(data, current);
  const chosen = chapters.find((c) => c.order === sel.chapter);
  if (!chosen) {
    return {
      step: "chapter",
      chapters: chapters.map((c) => ({
        order: c.order,
        label: chapterLabel(c.order, c.name),
      })),
    };
  }

  const missions = missionsInChapter(data, chosen.slug);
  const picked = missions.find((m) => m.order === sel.mission);
  return {
    step: "mission",
    chapter: {
      order: chosen.order,
      label: chapterLabel(chosen.order, chosen.name),
    },
    missions: missions.map((m) => ({
      order: m.order,
      number: m.number,
      selected: m === picked,
    })),
    selected: picked
      ? {
          order: picked.order,
          number: picked.number,
          title: missionTitle(data, picked.slug),
        }
      : null,
  };
}

/**
 * Maps a submitted global mission order to its slug. Strict: digits only, in
 * range. The error never echoes the input.
 */
export function missionFromOrder(
  data: CuratedData,
  raw: string | null,
): string {
  const mission =
    raw !== null && /^[0-9]+$/.test(raw)
      ? data.missions.find((m) => m.order === Number(raw))
      : undefined;
  if (!mission) throw new Error("Invalid mission");
  return mission.slug;
}
