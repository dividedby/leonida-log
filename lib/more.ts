import type { Theme } from "./db/schema";
import type { CuratedData } from "./curated";
import { storyPosition, type StoryPosition } from "./home";
import { settingsView, type ThemeOption } from "./settings";

/**
 * View model for More. Only the current mission's own position shows: no
 * later mission, optional mission or chapter is named (ADR 0002). Romance and
 * criminal profile have no curated data yet, so they carry a fixed status
 * and nothing else.
 */
export interface MoreView {
  story: StoryPosition;
  research: { title: string; status: string }[];
  theme: ThemeOption[];
  /** Read-only: a spoiler mode isn't built in v1 (ADR 0002). */
  spoilers: string;
}

export function moreView(
  data: CuratedData,
  current: string,
  theme: Theme,
): MoreView {
  return {
    story: storyPosition(data, current),
    research: ["Romance", "Criminal profile"].map((title) => ({
      title,
      status: "Research in progress",
    })),
    theme: settingsView(theme),
    spoilers: "Spoilers: safe. Opening later content isn't available in v1.",
  };
}
