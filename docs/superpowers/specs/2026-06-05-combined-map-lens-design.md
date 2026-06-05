# Combined map lens (pins + rainbow heatmap) — design

**Date:** 2026-06-05
**Status:** Approved, pending implementation plan

## Problem

The MapShell map (live on prod, `VITE_MAP_SHELL=true`) uses a single-select
**lens** switcher: `pins | density | routes | boundary`. `density` renders a
heatmap and **hides the pins**; `pins` shows clusters/markers and no heatmap.
The two are mutually exclusive.

Users want to see point markers and the density heatmap **at the same time**,
as the default landing view. The heatmap already has a pride-spectrum rainbow
ramp (gated by `pridePalette`, hardcoded on in MapShell) but users rarely see it
because every context defaults to `pins`.

## Goal

Add a `combined` lens that draws the rainbow heatmap **underneath** the pins,
and make it the default in the contexts where both pins and density already
exist. Keep the pure `pins` and pure `density` lenses selectable.

## Non-goals

- No change to the heatmap color ramp itself (the existing pride spectrum stays).
- No change to `search` (pins-only), `country` (pins+boundary), or `trip`
  (pins+routes) defaults — they have no density lens.
- No new data, schema, or backend change.

## Decisions (from brainstorming)

1. **Behavior:** Combined is the new *default* lens; pure Pins and pure Density
   remain selectable via the lens switcher.
2. **Scope:** Apply combined "everywhere it makes sense" — i.e. every context
   that already offers a density lens: `discover`, `city`, `admin`.
3. **Vividness:** Use the **existing** pride ramp at **full strength** under the
   pins (no opacity dial-back). Pins' white halos keep them legible over hot zones.

## Design

### 1. Lens model

`src/components/map/MapShell.types.ts`
- Add `'combined'` to `MapLens`.
- `LENS_LABELS.combined = 'Combined'`.
- Registry (`SURFACE_PRESETS`): add `'combined'` to the `lenses` array of
  `discover`, `city`, `admin`, and set each `defaultLens = 'combined'`.
- Pill order in those lens lists: `['combined', 'pins', 'density', 'boundary']`
  (boundary only where it already existed).

`src/components/map/LensPicker.tsx`
- Add `combined: Layers` to `LENS_ICONS` (import `Layers` from `lucide-react`).

### 2. Render wiring

`src/components/map/ExploreMap.tsx`
- Widen the prop: `renderMode?: 'pins' | 'heatmap' | 'combined'`.
- Heatmap effect (currently keyed on `renderMode === 'heatmap'`):
  - `wantHeatmap = renderMode !== 'pins' && pointEnabledLayers.length > 0`.
  - Hide cluster/pin layers **only** when `renderMode === 'heatmap'` (pure
    density). For `'combined'`, leave them visible.
  - When adding the heatmap layer, insert it **below** the pins by passing the
    first pin/cluster layer id as the `beforeId` to `addLayer`
    (`map.addLayer(layer, CLUSTERS_LAYER)`), so markers render on top. Guard for
    the case where the pin layers don't exist yet (append, then the pins effect
    adds above — verify ordering; if pins can be added after the heatmap, the
    heatmap effect must re-assert order or the pins effect must insert above).
  - No opacity multiplier — full existing ramp.
- The effect's dependency array already includes `renderMode` and `pridePalette`;
  no change needed there beyond the new branch logic.

`src/components/map/MapShell.tsx`
- Adapter:
  `renderMode = state.lens === 'density' ? 'heatmap' : state.lens === 'combined' ? 'combined' : 'pins'`.
- Layer set (`exploreLayers` memo): `combined` uses the **full** enabled layer
  set (do NOT apply density's venues/events restriction). Only `density` keeps
  that restriction.

### 3. Migration / compatibility

- No data or schema change.
- `parseLens` validates the URL/localStorage lens against each context's
  `config.lenses`, so a stale `?lens=combined` on a context that lacks it falls
  back to that context's default safely.
- Changing `defaultLens` only affects users with **no** explicit lens choice.
  Returning users with a saved `prefs.lens` or an explicit `?lens=` keep theirs.

### 4. Tests

- `useMapShellState`: assert `discover`/`city`/`admin` default to `combined`;
  assert an explicit `?lens=pins` / saved pref still overrides.
- `LensPicker`: renders a `Combined` pill with the `Layers` icon when the lens
  list includes it.
- `ExploreMap` render test: with `renderMode='combined'`, the heatmap source +
  layer are added AND the cluster/pin layers remain `visibility: visible`
  (i.e. not hidden); with `renderMode='heatmap'`, pins are hidden.

## Rejected alternatives

- **Make density itself additive** (density always shows pins too): loses the
  "pure density" view the user wanted to keep.
- **Separate heat-overlay toggle independent of the lens**: extra UI surface and
  state; scope creep versus a single extra lens.
- **Dial heat opacity back under pins**: rejected per the vividness decision —
  full-strength ramp chosen.
