# /going-out redesign: city + date, Highlights, interest filters

Decided 2026-11-24 in a brainstorming session with the product owner.

## What changed

- **City and date can be changed on `/going-out`**, and the choice is **shared with the homepage**.
  - City: `RegionChip` in the hero. A pick writes the session region override (the one the homepage chip writes) and `?city=`. `useIntentLocation` now listens for `REGION_EVENT`, so a pick applies live.
  - Date: `WhenChips` — Tonight / This weekend / Next 7 days / Pick a day. Stored in sessionStorage `qg_home_when` (12 h TTL, same rules as the region override) and in `?when=` on `/going-out`. Module: `src/lib/whenSelection.ts`.
  - An explicit `?city=` / `?when=` in a `/going-out` URL is carried over to the session, so a shared link also sets the homepage.
  - Homepage: the events board shows the same date chips; `useHomeNearYou` and `HomeCityFeature` use the picked range. No pick = unchanged behaviour.
- **Highlights** section: Prides, festivals and fairs (`event_type` pride/festival/fair) in any city, from the picked date (or now) to at least 60 days ahead; running festivals included; own city first, then own country, then the rest. Listings spanning more than 45 days are dropped (season-long artefacts).
- **Interests** filter bar (in the hero, under the date chips — first shipped as its own section, which read as a wall of chips): four dropdowns, active filters as removable pills plus "Clear". Filters "What's on" and "Where to go":
  - Activities (event types — moved here from "What's on"; events only)
  - Who it's for (`target_groups`)
  - Features + kinks (`KinkFilterGroup`, 18+ unlock for sensitive terms)
  - Accessibility (`accessibility_attributes`; negative terms like "not step-free" are not offered as filters)
  - URL params: `type`, `groups`, `tags`, `access`. Page-local, not shared with the homepage.
- **A picked date is answered as asked**: no widening to other dates or cities.
- **Removed**: "Before you go" (rights link), "Elsewhere" (other cities), footer "Full guide to <city>". `GatedContentNotice` moved under "Where to go" — it tells signed-out readers content exists in criminalising countries and must stay.
- Fixed in passing: `getPresetDateRange('this-weekend')` on a Saturday/Sunday returned the following weekend.

## Known limits

- Highlights reads one worldwide page of 40 and ranks it; a city's own festival beyond the 40 soonest worldwide is missed.
- Interest columns are thinly populated, so filtered results are often empty; the page shows "Clear filters".

## Revision 2026-11-24: one sticky toolbar

The filters first lived in the hero, far above the sections they change, and "Where to go" had its own place-type chips — two filter systems on one page. Now:

- City, date (`WhenMenu`), Filters (`InterestsMenu`, one popover) and place type (`PlacesMenu`) sit in one toolbar inside the sticky block under the section nav (`SectionNav` `toolbar` slot, outside the `<nav>` landmark). Active filters follow as removable pills. On a phone the row scrolls sideways instead of wrapping.
- Each section's description states what it is scoped to ("This weekend · Darkroom", "Bars · Darkroom"); nothing is shown when nothing is chosen. (`kicker` is not rendered since 2026-11-18, so this uses `description`.)
- Filters now also narrow Highlights (activities excepted). With filters on, an empty Highlights says so instead of disappearing.
- Grid / list / map moved into the "Where to go" header.
