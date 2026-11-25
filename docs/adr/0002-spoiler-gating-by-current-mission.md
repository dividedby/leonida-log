# 2. Spoiler gating by current mission

Date: 2026-11-25
Status: Accepted

## Context

Launch-week guides mix late-game spoilers into early tips. The guide must never show anything past where the player is.

## Decision

All content is keyed to the ordered mission list. The user's current mission is the only gate input. An item renders only when `visible_after_mission` is at or before the current mission; otherwise it counts as a locked item and shows only as a count ("4 more unlock after Day Release"). Gates (points of no return) and missions past the current one are never named. Gating lives in pure functions in `lib/gates.ts`, written test-first.

## Consequences

- Every item must carry `visible_after_mission`; curated data validation fails without it.
- The onboarding mission picker must itself be spoiler-safe: chapter first, then missions only within the chosen chapter.
- Opening later content on purpose (a spoiler mode) is a setting, off by default.
