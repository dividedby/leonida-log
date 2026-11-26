# CONTEXT.md (glossary)

Use these terms in code, issues, tests and docs. Component names (PostcardHeader, ExitSign, StatStrip…) are in docs/design.md.

- **Point of no return (gate):** a mission after which things are lost or locked (e.g. Tourist Trap, mission 20 of Chapter 1). Avoid "checkpoint".
- **Before-you-move-on checklist:** the items to finish before a gate, grouped by category.
- **Current mission:** the mission the user is on (reached, not completed); drives all spoiler gating. An item is visible when its `visible_after_mission` is at or before it.
- **Item:** one checklist entry, with category, gate, visibility and sources.
- **Category:** Stats, Vehicles, Focus, Collectibles, Money, Romance, Criminal profile, and so on.
- **Locked item:** an item whose `visible_after_mission` is past the current mission. Only the count and the unlock mission show ("4 more unlock after Day Release"); content stays hidden.
- **Unlock mission:** the earliest `visible_after_mission` among a gate's locked items. Its title is the one mission past the current that may be named, along with the next gate.
- **Soon lost:** an item whose reward or access ends at its `lost_at_mission`, a gate or an earlier mission.
- **Curated:** verified data in data/curated, committed.
- **Candidate:** a scraped fact awaiting review; shown only as "needs research", never as raw scraped text.
- **Source:** a guide page or database an item or candidate cites, with URL and fetch time.
- **Stats:** Strength (max health), Cardio (max stamina), Focus (slow-motion length); levels 0-4, per character.
- **Workout log:** manual record of training, used to show when Strength or Cardio may slip.
- **Characters:** Jason, Lucia.
- **Spoiler mode:** `safe` (hide everything past the current mission) or `open` (show it); stored in `progress`, default `safe`.
