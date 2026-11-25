# CONTEXT.md (glossary)

Use these terms in code, issues, tests and docs. Component names (PostcardHeader, ExitSign, StatStrip…) are in docs/design.md.

- **Point of no return (gate):** a mission after which things are lost or locked (e.g. Tourist Trap, mission 20 of Chapter 1). Avoid "checkpoint".
- **Before-you-move-on checklist:** the items to finish before a gate, grouped by category.
- **Current mission:** the user's story position; drives all spoiler gating.
- **Item:** one checklist entry, with category, gate, visibility and sources.
- **Category:** Stats, Vehicles, Focus, Collectibles, Money, Romance, Criminal profile, and so on.
- **Locked item:** an item whose `visible_after_mission` is past the current mission. Only the count shows ("4 more unlock after Day Release").
- **Soon lost:** an item whose reward or access ends at a gate (`lost_at_mission`).
- **Curated:** verified data in data/curated, committed.
- **Candidate:** a scraped fact awaiting review; shown only as "needs research", never as raw scraped text.
- **Source:** a guide page or database an item or candidate cites, with URL and fetch time.
- **Stats:** Strength (max health), Cardio (max stamina), Focus (slow-motion length); levels 0-4, per character.
- **Workout log:** manual record of training, used to show when Strength or Cardio may slip.
- **Characters:** Jason, Lucia.
