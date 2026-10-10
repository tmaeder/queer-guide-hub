# Cruising map data and hybrid controls design

## Problem

The production cruising map can render its basemap while showing no cruising spots. The existing production E2E only proves that the map canvas exists, so an empty feature layer can pass unnoticed. The Nearby people filters are also over-compressed into popovers even when their option set is small.

## Approved interaction design

- Keep Role and Body visible as compact, horizontally scrollable multi-select chips.
- Keep Age visible as a compact dual-handle range slider with its numeric range alongside it.
- Keep Into in a searchable popover because its taxonomy is large.
- Show active filters as removable chips and retain a single Clear action.
- On narrow screens, preserve the controls in a horizontal scroll row instead of moving every control into a dropdown.

## Map reliability design

- Treat a rendered basemap and a populated cruising layer as separate success conditions.
- Trace the authenticated cruising-spots RPC, bounds handling, and coordinate normalization using production-shaped data.
- Show an explicit recoverable map-data state when spot loading fails instead of silently displaying an empty layer.
- Keep the full spot directory independent of the current map viewport so users can still browse every spot.
- Extend production E2E coverage to require a non-zero spot result and a rendered map feature when production data exists.

## Verification

- Unit tests cover chip selection, age range behavior, searchable Into selection, and active-filter removal.
- Hook/query tests cover initial map loading without bounds and subsequent bounded searches.
- Map tests verify valid coordinates become GeoJSON features.
- Production E2E verifies authenticated users see real spot results and at least one rendered spot feature, then exercises the hybrid controls.
