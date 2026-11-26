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
- Earlier cutoffs (a mission that closes an optional job before the gate) are carried only by `lost_at_mission`, never by name in text. The app will later show "Closes in N missions" and "Do this before your next story mission" from `lost_at_mission`. UI is out of scope for this change.
- The off-list Chapter 5 names (Honest Abe, Pay Abe's Fee, Unfinished Business) stay banned in all item text.
- Enforced by `lib/curated.data.test.ts`.

## Consequences

- Every item must carry `visible_after_mission`, the single visibility field; curated data validation fails without it.
- The onboarding mission picker must itself be spoiler-safe: chapter first (named "Chapter N" until reached), then missions within the chosen chapter listed by number, with a title revealed only for the one the user selects.
- `lib/gates.ts` returns mission ids and numbers, never titles. Titles come from a separate lookup, so each place a title is shown is a deliberate, reviewable call.
- Opening later content on purpose (a spoiler mode) is a setting, off by default.
