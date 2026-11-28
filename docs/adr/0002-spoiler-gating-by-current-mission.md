# 2. Spoiler gating by current mission

Date: 2026-11-25
Status: Accepted

## Context

Launch-week guides mix late-game spoilers into early tips. The guide must never show anything past where the player is.

## Decision

All content is keyed to the ordered mission list. The user's current mission is the only gate input: the mission they are on (reached, not completed). An item renders only when `visible_after_mission` is at or before the current mission; otherwise it counts as a locked item and shows only as a count ("4 more unlock after Day Release"). Missions past the current one are never named, except the exceptions below. Gating lives in pure functions in `lib/gates.ts`, written test-first.

Naming exceptions (added 2026-11-25):

- **Unlock mission:** the locked-item row names the mission that unlocks the earliest locked item for that gate ("4 more unlock after Day Release"). Only the title is shown; the items' content stays hidden.
- **Next gate:** the exit sign names the next point of no return before it is reached ("EXIT 20 · Tourist Trap"). Gate mission titles are nameable; what happens in them is not.

Item text rule (amended 2026-11-26):

- An item's text (`title`, `how_to`, `location`) may not name any mission after the item's own `visible_after_mission`, except the title of the gate the item belongs to. This replaces the earlier looser check (no mission after the gate).
- Earlier cutoffs (a mission that closes an optional job before the gate) are carried only by `lost_at_mission`, never by name in text. The app shows "Closes in N missions" and "Do this before your next story mission" from `lost_at_mission`.
- The off-list Chapter 5 names (Honest Abe, Pay Abe's Fee, Unfinished Business) stay banned in all item text.
- Enforced by `lib/curated.data.test.ts`.

Optional missions (second amendment, 2026-11-26):

- Optional missions (any kind other than `main`) open after an anchor and close at a main mission or never. An optional's title and note show from its anchor on, and may not name a main mission after the anchor except the title of the gate it is bound to. Item text may not name an optional's title before the item's `visible_after_mission`.
- Cutoffs show as a countdown ("Closes in N missions", "Do this before your next story mission"), computed from the current mission, never by naming the closing mission. A gate's `lost` list shows the same way, as a countdown to the gate, so no `lost` entry names a mission.
- The current mission is always a main mission. Optional missions never enter the picker or the order.
- `lockedSummary` counts optional missions that haven't opened yet; its unlock mission is the optional's anchor (a main mission), never the optional itself.
- Enforced by `lib/curated.data.test.ts`.

Picker addressing (third amendment, 2026-11-27):

- The picker addresses chapters and missions by number only: the chapter's `order` and the mission's global `order`. Mission and chapter slugs are kebab-cased titles, so a slug in a URL, hidden field or client payload would name the mission. The server action maps the submitted order to a slug (`missionFromOrder`). A title appears only for the selected mission.
- Home's "Mission N of M" is chapter-relative (the mission's number in its chapter, the chapter's mission count). The current mission's chapter and title are reached, so they show.
- Enforced by `lib/picker.test.ts` and `lib/home.test.ts`, which run every mission as the current one against the real curated data and fail if any later main mission title or slug, an unopened optional or an unreached chapter name appears.

Checklist, detail and done pages (fourth amendment, 2026-11-27):

- The item detail route is `/checklist/item/[id]`, addressed by item id or an optional mission's slug. A URL can name a mission only through an opened optional's slug (its title is nameable from its anchor on); every other id is an item id. `itemDetail` returns null unless `isTickable` allows the id, so a hidden item, an unopened optional and an unknown id all give the same 404 with no content and no oracle for what exists. The page title stays the app default and the 404 body is the framework's generic one.
- A detail sheet shows curated fields only (title, category, `how_to`, `location`, `note`, character, source titles and links), never `verified`, `evidence` or scraped data. Source titles and links are curated from outside and can name missions the item text may not ("IGN: Feng Shui walkthrough"), so a source whose title or link names a main mission after the current one is withheld; the entry's own gate (an item's `before_gate`, an optional's bound gate) may be named, as in its text.
- Names allowed on each page: the checklist names the next gate (header), the locked row's unlock mission, opened optional missions and visible items; `/done` names only the current mission (reached). A gate's `lost` entries show on `/done` for the current gate and on the checklist only while the gate is ahead, as a countdown.
- Marking a mission done posts the current mission's global order, never a slug, and moves exactly one mission; a stale or repeated form is a no-op. Crossing a gate needs the `/done` confirmation.
- Enforced by `lib/checklist.test.ts` and `lib/done.test.ts`, which run every mission as the current one against the real curated data and fail if a later main mission title, an unopened optional or an unreached chapter name appears.

## Consequences

- Every item must carry `visible_after_mission`, the single visibility field; curated data validation fails without it.
- The onboarding mission picker must itself be spoiler-safe: chapter first (named "Chapter N" until reached), then missions within the chosen chapter listed by number, with a title revealed only for the one the user selects.
- `lib/gates.ts` returns mission ids and numbers, never titles. Titles come from a separate lookup, so each place a title is shown is a deliberate, reviewable call.
- Opening later content on purpose (a spoiler mode) is a setting, off by default. Not built in v1: nothing reads `spoilerMode`, and More shows "Spoilers: safe" read-only (2026-11-27).
