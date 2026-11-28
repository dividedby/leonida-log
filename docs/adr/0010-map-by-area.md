# 10. Map by area on a self-drawn schematic

Date: 2026-11-27
Status: Accepted

## Context

v2 adds the Map tab (docs/design.md listed it as out of v1). The repo bans Rockstar logos, the GTA VI wordmark, screenshots and key art, so the in-game map can't be the base. No open tile set exists for Leonida, and fan maps are other people's work and usually trace game imagery. The curated data has no coordinates: items carry a free-text `location` ("Any ATM, or the ATM Finder in the BuckMe app"), optional missions carry none. Area names are spoilers too: a player in Chapter 1 shouldn't learn where Chapter 3 goes.

## Decision

- **Content:** the map shows what the checklist shows, placed by area: visible items and opened optional missions for the next gate, plus safe-to-leave optionals. Collectibles and points of interest (gyms, stores) are out of v2.
- **Art:** an original SVG schematic of Leonida's areas as simple shapes in the Postcard palette, drawn in the repo. Not to scale and not traced from game imagery. Static, fit to the phone width, areas as links, no client JS, no pan or zoom.
- **Areas, not points:** new `data/curated/areas.yaml`, each area with `slug`, `name`, `visible_after_mission` and an optional `parent`. v2.0 ships regions only (about 6 to 8); districts come later as child rows, and tapping a region with districts opens its own schematic. A district can't be visible before its parent.
- **Placement:** items and optional missions gain an optional `area` (one slug, a region or a district). For an optional mission it is where it starts (the marker or contact), never where its content happens. The area must be visible no later than the entry: an item's `visible_after_mission`, an optional's opens-after anchor. `location` stays as the free-text how-to-find line.
- **No area** means the row shows in an "Anywhere" list under the map. Truly-anywhere and not-yet-placed rows look the same (ADR 0008: no confidence labels).
- **Gating (extends ADR 0002):**
  - An area past the current mission is an unnamed shape in the rule colour: no name, no count, not a link. Its route is the same 404 as an unknown slug.
  - The map shows no locked counts, overall or per area: a count by area would say where future content is. The checklist's LockedRow stays the one place locked counts show.
  - A region's badge counts the unticked rows its area sheet shows (districts roll up), so closed rows never count.
  - No item or optional text (`title`, `how_to`, `location`, `note`) names an area before that area's `visible_after_mission`, enforced by `lib/curated.data.test.ts` next to the mission-name rule.
  - Map view-model leak tests run every mission as the current one against the real data and fail on a later area name or slug, a later mission title, or a hidden entry.
- **Area sheet:** tapping a region opens `/map/[area]`, server-rendered: the area's rows as ChecklistRows (tickable, countdown and "Soon lost" chips, detail chevron). Closed rows are left out.
- **Cross-links:** a ChecklistRow with an area shows a muted area tag (on `/checklist` and Home's Up next alike), and detail pages show "Area: {name}" linking to that area on the map.
- **TabBar:** five tabs: Story, Checklist, Map, Stats, More.
- **Online only,** like v1 (ADR 0001). No service worker; offline stays a separate later decision.
- **Order of work:** the Map screen, area sheet, five-tab TabBar and row tag are mocked in the design reference and picked by the owner before any UI build. Regions and the schema land first; entries get areas as research finds them; the Map ships once Tourist Trap's entries are placed.

## Consequences

- No Rockstar art or fan tiles, so no IP or licence risk, at the cost of precision: the map says which area, not which spot. `location` carries the detail.
- Area visibility follows best evidence (ADR 0008): when sources split on when an area is reached, the latest plausible mission wins.
- Each new area and every `area` value is curated by hand with sources, like items.
- The "Anywhere" list starts large and shrinks as weekly research places entries.
- Districts need no schema change, only new rows and a drill-in schematic.
- Exact points (x/y) were rejected: on a schematic that isn't to scale they would imply accuracy the data doesn't have.
