# 11. Counties above regions, districts below, on a more detailed schematic

Date: 2026-11-28
Status: Accepted. Supersedes parts of [ADR 0010](0010-map-by-area.md): see Supersedes.

## Context

ADR 0010 shipped the Map as six regions on a coastline schematic and kept counties out ("counties are not areas") because a county can't be a region or an alias of one: Kelly County spans Port Gellhorn and Ambrosia, and Mariana spans the Keys and Grassrivers. That left two gaps. Sources place many entries more finely than a region (a Vice City neighbourhood, a town like Millport) or more coarsely (a county, as in the guides' "Lummox County > Millport"), and those entries sit in Anywhere or get a region that is wider or narrower than their source. The schematic is also coarse: six blobs.

Facts behind the decision (gta.wiki text is CC BY-NC-SA 3.0; read 2026-11-28):

- **Counties:** Kelly (west): Port Gellhorn, Ambrosia and Buckskin, Gellhorn Raceway, Leonida State Prison. Vice-Dale (east of Kelly): Vice City (the seat), Vice Beach, Hamlet, Bluegrass, Peregrine Bay. Mariana: Capri, Key Lento, Watson Bay, Pelican Valley, Belpoint, Southwind, Bobcat Key, Mile Zero Air Station, and "appears to be home to Grassrivers and Leonida Keys". Lummox (north): Millport, Grayson, Moreau, Bonanza, Mount Kalaga National Park, Domed Hills. Leonard: Sundown, Belville, Waning Sands, Vinewood Beach, North Beaches. Ambrosia County is a beta location only. Sources: https://gta.wiki/w/Kelly_County, https://gta.wiki/w/Leonida, https://gta.wiki/w/Mariana_County, https://gta.wiki/w/Lummox_County.
- **Where the names are evidenced:** road signs in the trailers (Kelly on a westbound I-404 sign in Vice City; Mariana and Vice-Dale on an I-404 sign in Port Gellhorn) and the August 2026 leaked full map (Lummox). gta.wiki doesn't say the in-game map labels counties. Guides use the names in their location strings (PowerPyx "Kelly County > Port Gellhorn").
- **Regions in the sources don't split across counties.** Port Gellhorn and Ambrosia are in Kelly, Vice City in Vice-Dale, the Keys and Grassrivers in Mariana, Mount Kalaga National Park in Lummox. Fan wiki, unconfirmed. The county lists don't cover every town: Capri, Millport and Hamlet, among others, belong to no region.
- **Vice City's districts** (https://gta.wiki/w/Vice_City): on the mainland Balsero, Bayside, Crosstown, Downtown Vice City, La Perle, Little Cuba, Peacock Bay, Rockridge, Salton, Southside, Stockyard, Tequesta, Tisha-Wocka, Vice Decor District and VC International Airport; in Catalan Bay, Catalan Key, PortViceCity, Gloriana Key and Tequesta Retreat.
- **Vice Beach is inconsistent in the sources.** https://gta.wiki/w/Vice_Beach treats it as a separate city in Vice-Dale "considered part of the Vice City metropolitan area", with Ocean Beach, Penmarch Isle, Washington Beach, Starfish Island, Leaf Links, Rialto Islands, Waxman Island and Dalton Island. The Vice City page doesn't list it; the Kelly County page lists it among Vice City's neighbourhoods.

## Decision

- **Counties are the top level:** county > region > district. Five counties, all visible from the prologue: Kelly, Vice-Dale, Mariana, Lummox, Leonard. The beta-only Ambrosia County is left out.
- **Finest sourced level:** an entry takes the most specific area its sources support (a district, a region or a county). Anywhere is only for entries with no place at all.
- **Towns outside any region** (Capri, Millport, Hamlet, and so on) become districts directly under their county. A district's parent is a region or a county.
- **Vice Beach** is a district of Vice City (owner decision, settling the split above). Districts don't nest, so the hierarchy has three levels at most: an entry in Washington Beach is placed on Vice Beach, and "Washington Beach" stays in its location text. The Vice Beach data row's evidence note records the source conflict and this ruling.
- **Art:** a better hand-drawn schematic: county borders, a closer coastline, region shapes and Vice City's district shapes. Still not to scale, no coordinates, no tracing. Drawings are the Leonida map (redrawn) and Vice City's districts only; other sheets list their districts as rows.
- **Navigation:** one Leonida map with county borders and labels and the region shapes inside. A region opens its sheet, with a district map where one exists. A county label opens a county sheet with its regions and its county-level rows.
- **District sheets:** each district opens its own sheet, as a region does, from Vice City's district map or from its row on a region or county sheet. A region sheet shows its rows and a list of its districts with badges.
- **Badges:** no county badge. A region's badge rolls up its districts. The county sheet lists the county-level rows (the county's own plus those of its county-parented districts, rolled up) and links to its regions with their badges.
- **Tags and detail:** a row's area tag shows the finest name only. A detail page shows the full path ("Area: Stockyard, Vice City, Vice-Dale"), each level a link.
- **Visibility:** a district is visible from the prologue by default. A district reached only in the story gets its first-visit mission (the latest plausible one, ADR 0008). A child is never visible before its parent.
- **Schema (data only, no DB migration):** `areas.yaml` gains `kind` (`county`, `region` or `district`). A county has no parent. A region's parent is a county (required). A district's parent is a region or a county.
- **Text rule (ADR 0010 update):** covers county and district names and aliases too. A county's `name` is the full "X County" ("Kelly County"); no bare-word aliases ("Kelly", "Leonard"), since they collide with ordinary words and character names. Matching stays whole-word and case-insensitive. A generic district name that collides with ordinary words ("Downtown") gets a qualified name or an alias-free entry so the whole-word rule doesn't false-positive; each case is decided in the data PR.
- **Leak tests:** extended to counties and districts, on the real data and on a fixture with a district hidden until a later mission. All-prologue real data proves nothing on its own.
- **Evidence:** Lummox and Leonard rest on gta.wiki plus the road signs and the leaked map, recorded as `best-guess` evidence (ADR 0008). Shipping on that is accepted.
- **First build scope:** the five counties, Vice City's districts (Vice Beach included) and the unregioned towns current entries need (Capri, Millport, Hamlet). More areas are added as entries need them. Every placed and Anywhere entry is then re-checked against the new layers (plan v3 step 6).

## Supersedes

From ADR 0010:

- **"Counties are not areas"** (Update, 2026-11-27): replaced. Counties are areas, one level above regions. The finding it rested on (counties span regions) still holds and is why a county is its own level rather than an alias.
- **"v2.0 ships regions only (about 6 to 8)":** replaced. A region's parent is a county, and districts are in the first build for Vice City and the unregioned towns.
- **The schematic of regions only** (Decision, Art): replaced by the schematic with county borders and labels, region shapes and Vice City's district map. "Not to scale and not traced from game imagery", "static, fit to the phone width, no client JS, no pan or zoom" and the Postcard palette stand.
- **"Districts later as child rows ... tapping a region with districts opens its own schematic"** (Decision, Areas not points) and **"Districts need no schema change"** (Consequences): refined. A district's parent is a region or a county, the schema needs `kind`, and only Vice City gets a district drawing; a region sheet carries it. Other regions list districts as rows.
- **"No area means the row shows in an Anywhere list":** refined. No area now means no place at all; an entry with any sourced county, region or district is placed.

Unchanged: area visibility and gating, no locked counts on the map, the Anywhere list's wording, `area` on items and optional missions, the area sheet route and rules, the row tag and detail link (now with the finest name and the full path), five tabs, online only.

## Consequences

- More entries are placed, and more precisely. The Anywhere list shrinks again.
- `lib/curated.ts` validation moves from one level (a parent can't have a parent) to `kind`-based rules: county, region, district; the parent kinds above; a child never earlier than its parent. `lib/map.ts` no longer treats "no parent" as "region", and the Schematic's shape-to-region `index` mapping and its test change (plan v3 steps 4 and 5).
- County names, district names and aliases are spoilers like any area name: gated, covered by the text rule and by the leak tests. More names raise the false-positive risk on ordinary words.
- The area sheet route now serves counties and districts as well as regions. Hidden, unknown and not-yet-visible slugs stay the same 404.
- More labels on a phone-width map: legibility is a design risk, checked in the mockup (plan v3 step 2).
- Each new area and every changed `area` value is curated by hand with sources, as in ADR 0010. County membership rests on one fan wiki (CC BY-NC-SA 3.0) plus road signs and a leak; it is best evidence, re-checked weekly (ADR 0008).
- Exact points (x/y) stay rejected for the same reason as in ADR 0010.
