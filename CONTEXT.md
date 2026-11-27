# CONTEXT.md (glossary)

Use these terms in code, issues, tests and docs. Component names (PostcardHeader, ExitSign, StatStrip…) are in docs/design.md.

- **Point of no return (gate):** a mission after which things are lost or locked (e.g. Tourist Trap, mission 20 of Chapter 1). Avoid "checkpoint".
- **Before-you-move-on checklist:** the items to finish before a gate, grouped by category.
- **Main mission:** one of the 91 story missions in `missions.yaml`. Its list position is its order. Only main missions can be the current mission, a gate, or a `lost_at_mission`.
- **Optional mission:** a mission that isn't on the story path, with a kind (`optional`, `strangers-and-freaks`, `hourglass` or `side-job`), a character, an opens-after anchor and a closes-at. Listed after the mains; it has no order of its own.
- **Opens after (anchor):** the mission an optional mission opens after. It may be another optional; the anchor is the main mission at the end of that chain. The optional opens when the user reaches its anchor.
- **Closes at:** the main mission whose arrival closes an optional mission (standing on it counts as closed), or `never` when it stays open after the story. A closing mission is bound to the first gate at or after it.
- **Countdown:** how far off a cutoff is, as a count of main missions ("Closes in N missions", "Do this before your next story mission" at 1). It never names the closing mission.
- **Derived row:** a checklist row the app builds from an optional mission instead of a hand-written item. It can be ticked.
- **Safe to leave:** opened optional missions that never close, so they can wait until after the story.
- **Current mission:** the mission the user is on (reached, not completed); always a main mission; drives all spoiler gating. An item is visible when its `visible_after_mission` is at or before it.
- **Item:** one hand-written checklist entry, with category, gate, visibility and sources. An optional mission's row is a derived row, not an item.
- **Category:** Stats, Vehicles, Focus, Collectibles, Money, Romance, Criminal profile, and so on.
- **Locked item:** an item whose `visible_after_mission` (or an optional mission whose anchor) is past the current mission. Only the count and the unlock mission show ("4 more unlock after Day Release"); content stays hidden.
- **Unlock mission:** the earliest main mission that unlocks something hidden for a gate: a locked item's `visible_after_mission` or an unopened optional mission's anchor (never the optional's own slug or title). Its title is the one mission past the current that may be named, along with the next gate.
- **Soon lost:** an item or optional mission whose reward or access ends at its `lost_at_mission` or `closes_at`, a gate or an earlier mission.
- **Curated:** data in data/curated at its current best-evidence value, committed and reviewed by hand (ADR 0008).
- **Best evidence:** the value the current sources support best; when they split, the one that can't hurt the player (earliest cutoff, latest visibility). Never labelled in the app.
- **Verified:** an item's `verified` flag, true when it meets two independent sources, one explicit non-AI source or first-hand video. Background only, never rendered.
- **Evidence:** optional `evidence` on an item or mission: `basis` (`two-sources`, `explicit-source`, `first-hand`, `best-guess`, `safe-bound`) and an optional `note`. Background only, never rendered.
- **Candidate:** a scraped fact awaiting review; never shown, raw or otherwise, until it is promoted to curated.
- **Source:** a guide page or database an item or candidate cites, with URL and fetch time.
- **Stats:** Strength (max health), Cardio (max stamina), Focus (slow-motion length); levels 0-4, per character.
- **Workout log:** manual record of training, used to show when Strength or Cardio may slip.
- **Characters:** Jason, Lucia.
- **Spoiler mode:** `safe` (hide everything past the current mission) or `open` (show it); stored in `progress`, default `safe`.
