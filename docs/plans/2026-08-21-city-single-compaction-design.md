# City single compaction — rows, not cards

2026-08-21. Approved design. Follows the country restructure
(`2026-08-21-country-single-restructure-design.md`) and PR #2916, which had
already compacted the city **head** (fact strip 229px, sticky rail TOC).

## Measured problem (prod, Berlin, 1440px): 12,518px

The head was fine; the bulk was entirely in the body sections.

| Section | Before | Contents |
|---|---|---|
| `#rights` | 2,385px | safety notes + legal breakdown (core value — untouched) |
| `#travel` | 1,946px | flights hub 984 + four-track network diagram 678 |
| `#venues` | 1,909px | 12 full `VenueCard`s in a bento mosaic |
| `#news` | 1,273px | 6 full `NewsCard`s, 2-col |
| `#overview` | 1,023px | prose + facts + cost of living + chips + weather |
| `#events` / `#districts` | 736 / 155px | already compact — untouched |

## Changes

- **`#venues` → `StopList` rows, cap 6** (1,909 → 593px). A city's venues are
  its hero, but a mosaic spends ~150px per venue on a photograph the reader is
  not deciding on; six named rows plus the existing "See all" carry the same
  decision. `includeCity: false` — every venue here is in this city, so the
  city name on six rows is noise.
- **`#news` → dated headline rows** (`OccurrenceList`, `floodFirst={false}`),
  cap 5 (1,273 → 429px).
- **Shared helpers, not twins.** `venueStops` / `newsRows` move to
  `components/transit/entityRows.tsx`; country repoints to them. The
  country/city difference is one explicit `includeCity` option.
- **`#travel` → hub compacted, diagram kept** (1,946 → 1,576px):
  - The hub rendered **"No hotels found in Berlin"** and "No activities
    found" as full headed bands — the empty shells spec rule 2 forbids and
    that this page's own news/districts sections already removed. A block with
    no results and no action now does not render. The actionable "Enable
    location to see flight deals" stays.
  - Car rental / airport transfer / insurance were three full-width bands for
    one affiliate link each; now one `sm:grid-cols-3` row.
  - `gap-8` → `gap-6`.
- **`#overview`** `gap-8` → `gap-6`. The `FactGrid` here was **already**
  compact (144px) — the planned "dense fact sheet" swap was measured and
  dropped as unnecessary.
- **Footer** `gap-10` → `gap-8`. **The rail list is deliberately NOT trimmed
  further**: #2916 curated it from ten rails to seven with a stated reason per
  cut, and cutting more without new evidence is taste, not measurement.

## Untouched on purpose

`#rights` (the reason the platform exists), the four-track network diagram (a
sanctioned brand surface that the design system keeps in the body, away from
the rail's risk badge), the high-risk no-deals branch and its `--destructive`
token, the head fact strip and sticky rail from #2916.

## Result (local, 1440px): 12,518 → **9,887px** (−21%)

venues −1,316 · news −844 · travel −370 · overview −40 · footer gaps.
Mobile 390px: single column, no horizontal overflow, 6 venue links + "See
all", 5 news links. Typecheck baseline improved 842 → 840 (dead bento imports).
