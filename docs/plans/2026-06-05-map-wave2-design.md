# Map "living atlas" — Wave 2 design

## Context
Wave 1 (PR #1454) tamed the heat, added rich popup cards, the spotlight rail, a legend,
and base motion (pulse/entrance/focus). Wave 2 pushes further across all four pillars.
User approved an ambitious round covering every cluster below. Constraints unchanged:
colored basemap stays, monochrome UI, map canvas = special motion zone (reduced-motion guarded),
new files under `src/components/map/**` are ESLint-exempt.

## Scope (approved)

### Polished
- **P1 Glyph pins** — render lucide category icons to map images (`map.addImage`) and draw a
  symbol icon layer on top of the colored dot, keyed by `iconKey` (category). Read a bar vs
  sauna vs event at a glance on the canvas itself.
- **P2 Lens cross-fade** — animate layer opacity when switching pins↔density↔combined instead
  of hard visibility swaps.
- **P3 Map→rail sync + selected elevation** — clicking a pin notifies MapShell (`onSelectPoint`)
  so the rail scrolls that card into view; selected pin gets an elevated ring (focus ring exists).
- **P4 Skeleton shimmer** — rail skeleton on first load instead of a 0→data pop.

### Discovery
- **D1 Time chips** — Tonight / This weekend / This month presets that drive the events
  `dateRange` filter, surfaced as quick chips in the command bar.
- **D2 Open-now toggle** — filter points to open-now venues / live events, with count.

### Informative
- **I1 Cluster preview** — hover a cluster → "12 venues · 3 events · 2 restrooms" from the
  existing `clusterProperties` aggregates.

### Alive
- **A1 Time-of-day mode** — after dark, dim closed venues and lift open/live ones (data-driven
  opacity on `live`).
- **A2 Event countdown** — "on now" / "in 2h" / "in 3 days" on event cards from `startDate`.
- **A4 Trending** — best-effort; lean on `is_featured`/`trust_score` (no check-in data yet).
  Surface as a "Trending" treatment on high-trust featured spots; note the data gap.

## Implementation order (low-risk → high-risk)
1. Card/data wins: A2 countdown, I1 cluster preview (uses existing aggregates).
2. Filters: D1 time chips, D2 open-now (extends ExploreMapFilters + CommandBar; openNow filtered
   client-side like `nearMe`).
3. P3 map→rail sync + P4 skeleton.
4. A1 time-of-day opacity.
5. P2 lens cross-fade.
6. P1 glyph pins (riskiest — canvas rasterization + sprite lifecycle; verify hard, fall back to
   circle+overlay if flaky).

## Key files
`src/hooks/useViewportPoints.ts` (clusterProperties breakdown, openNow filter), `useExploreMapData.ts`
(filter type), `ExploreMap.tsx` (cluster hover, glyph layer, cross-fade, selection callback,
time-of-day paint), `MapShell.tsx` (rail scroll-sync, time chips state), `MapEntityCard.tsx`
(countdown), `SpotlightRail.tsx` (skeleton, scroll-to-selected), `CommandBar.tsx`/`FilterPopovers.tsx`
(time chips + open-now toggle), new `src/components/map/mapGlyphs.ts` (icon rasterization).

## Verification
Browser /map: glyph pins render per category; cluster hover shows breakdown; time chips + open-now
filter pins/rail/count; countdowns correct; after-dark dimming; lens switch cross-fades; rail scrolls
to clicked pin. Typecheck + lint (0 errors) + unit tests. One PR, auto-merge.
