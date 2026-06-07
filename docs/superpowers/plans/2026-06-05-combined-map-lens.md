# Combined Map Lens (pins + rainbow heatmap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `combined` map lens that renders the existing rainbow density heatmap underneath the point pins, and make it the default in every context that already offers density (discover, city, admin).

**Architecture:** Lens stays single-select. A new `combined` value maps to a new `ExploreMap` render mode that draws the heatmap layer *below* the pin/cluster layers (so markers stay on top) without hiding the pins. The pure `pins` and `density` lenses are unchanged. Pure decision logic (lens→render-mode, lens→layer-set, render-mode→layer plan) is extracted into a maplibre-free `mapShellAdapters.ts` module so it can be unit-tested without mocking maplibre-gl.

**Tech Stack:** React 19, TypeScript, MapLibre GL, Vitest + React Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-05-combined-map-lens-design.md`

---

## File Structure

- **Modify** `src/components/map/MapShell.types.ts` — add `'combined'` to `MapLens`, its label, and set it as the default lens in the discover/city/admin presets.
- **Create** `src/components/map/mapShellAdapters.ts` — pure helpers: `lensToRenderMode`, `exploreLayersFor`, `heatmapRenderPlan`, plus the `RenderMode` type. No maplibre import.
- **Modify** `src/components/map/LensPicker.tsx` — add the `Layers` icon for the combined lens.
- **Modify** `src/components/map/MapShell.tsx` — use the adapter helpers instead of inline logic.
- **Modify** `src/components/map/ExploreMap.tsx` — widen `renderMode` to include `'combined'`; use `heatmapRenderPlan`; insert the heatmap below the pins.
- **Create** `src/components/map/__tests__/mapShellAdapters.test.ts` — unit tests for the pure helpers.
- **Create** `src/components/map/__tests__/LensPicker.test.tsx` — renders the Combined pill.
- **Modify** `src/hooks/__tests__/useMapShellState.test.tsx` — update default-lens assertions for the new `combined` default.

All commands run from the repo root `/Users/tobiasmaeder/QG`.

---

## Task 1: Add the `combined` lens to the type model and presets

**Files:**
- Modify: `src/components/map/MapShell.types.ts`
- Modify (tests): `src/hooks/__tests__/useMapShellState.test.tsx`

- [ ] **Step 1: Update the failing tests first**

In `src/hooks/__tests__/useMapShellState.test.tsx`, change the three discover-context default assertions and the "matches surface default" test.

Line ~21 (`parses defaults when URL is empty`):
```ts
    expect(result.current.state.lens).toBe('combined');
```

Line ~37 (`ignores lens values not allowed by the surface`) — `?lens=routes` is not in discover, so it falls back to the new default:
```ts
    expect(result.current.state.lens).toBe('combined');
```

Replace the whole `setLens removes the param when the value matches the surface default` test (lines ~68-74) with:
```ts
  it('setLens removes the param when the value matches the surface default', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?lens=density'),
    });
    act(() => result.current.setLens('combined'));
    expect(result.current.state.lens).toBe('combined');
  });
```

Add two new tests right after it:
```ts
  it('defaults city and admin surfaces to combined', () => {
    const city = SURFACE_PRESETS.city;
    const admin = SURFACE_PRESETS.admin;
    const cityHook = renderHook(() => useMapShellState(city), {
      wrapper: wrapper('/city'),
    });
    const adminHook = renderHook(() => useMapShellState(admin), {
      wrapper: wrapper('/admin'),
    });
    expect(cityHook.result.current.state.lens).toBe('combined');
    expect(adminHook.result.current.state.lens).toBe('combined');
  });

  it('still honors an explicit ?lens=pins over the combined default', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?lens=pins'),
    });
    expect(result.current.state.lens).toBe('pins');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/__tests__/useMapShellState.test.tsx`
Expected: FAIL — defaults still resolve to `'pins'` (and `'combined'` is not yet a valid `MapLens`, so the explicit-pins test still passes but the default tests fail).

- [ ] **Step 3: Extend the `MapLens` type and label**

In `src/components/map/MapShell.types.ts`:

Change line 5:
```ts
export type MapLens = 'pins' | 'density' | 'routes' | 'boundary' | 'combined';
```

In `LENS_LABELS` (after the `boundary` entry), add:
```ts
  combined: 'Combined',
```

- [ ] **Step 4: Set `combined` as default in the discover/city/admin presets**

In `src/components/map/MapShell.types.ts`, update the three presets. For each, prepend `'combined'` to `lenses` and set `defaultLens: 'combined'`.

`discover`:
```ts
    lenses: ['combined', 'pins', 'density', 'boundary'],
    defaultLens: 'combined',
```

`city`:
```ts
    lenses: ['combined', 'pins', 'density', 'boundary'],
    defaultLens: 'combined',
```

`admin`:
```ts
    lenses: ['combined', 'pins', 'density', 'boundary'],
    defaultLens: 'combined',
```

Leave `search`, `country`, and `trip` unchanged (they have no density lens).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useMapShellState.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/map/MapShell.types.ts src/hooks/__tests__/useMapShellState.test.tsx
git commit -m "feat(map): add combined lens type + default it for discover/city/admin"
```

---

## Task 2: Pure adapter helpers (lens→render-mode, lens→layers, render plan)

**Files:**
- Create: `src/components/map/mapShellAdapters.ts`
- Test: `src/components/map/__tests__/mapShellAdapters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/map/__tests__/mapShellAdapters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  lensToRenderMode,
  exploreLayersFor,
  heatmapRenderPlan,
} from '@/components/map/mapShellAdapters';
import type { LayerType } from '@/hooks/useExploreMapData';

describe('lensToRenderMode', () => {
  it('maps density to heatmap, combined to combined, everything else to pins', () => {
    expect(lensToRenderMode('density')).toBe('heatmap');
    expect(lensToRenderMode('combined')).toBe('combined');
    expect(lensToRenderMode('pins')).toBe('pins');
    expect(lensToRenderMode('boundary')).toBe('pins');
    expect(lensToRenderMode('routes')).toBe('pins');
  });
});

describe('exploreLayersFor', () => {
  const enabled: LayerType[] = ['venues', 'events', 'hotels', 'restrooms'];
  const config: LayerType[] = ['venues', 'events', 'hotels', 'neighbourhoods', 'cities'];

  it('returns the full enabled set for pins and combined', () => {
    expect(exploreLayersFor('pins', enabled, config)).toEqual(enabled);
    expect(exploreLayersFor('combined', enabled, config)).toEqual(enabled);
  });

  it('restricts density to venues and events only', () => {
    expect(exploreLayersFor('density', enabled, config)).toEqual(['venues', 'events']);
  });

  it('seeds boundary with preset area layers', () => {
    const result = exploreLayersFor('boundary', ['neighbourhoods'], config);
    expect(result).toContain('neighbourhoods');
    expect(result).toContain('cities');
  });
});

describe('heatmapRenderPlan', () => {
  it('wants the heatmap and keeps pins for the combined mode', () => {
    expect(heatmapRenderPlan('combined', true)).toEqual({ wantHeatmap: true, hidePins: false });
  });

  it('wants the heatmap and hides pins for the pure heatmap mode', () => {
    expect(heatmapRenderPlan('heatmap', true)).toEqual({ wantHeatmap: true, hidePins: true });
  });

  it('wants no heatmap for pins mode', () => {
    expect(heatmapRenderPlan('pins', true)).toEqual({ wantHeatmap: false, hidePins: false });
  });

  it('wants no heatmap when there are no point layers, even in combined/heatmap', () => {
    expect(heatmapRenderPlan('combined', false)).toEqual({ wantHeatmap: false, hidePins: false });
    expect(heatmapRenderPlan('heatmap', false)).toEqual({ wantHeatmap: false, hidePins: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/map/__tests__/mapShellAdapters.test.ts`
Expected: FAIL — `mapShellAdapters` module does not exist.

- [ ] **Step 3: Create the adapter module**

Create `src/components/map/mapShellAdapters.ts`:
```ts
import type { LayerType } from '@/hooks/useExploreMapData';
import type { MapLens } from './MapShell.types';

/** Point-rendering mode handed to ExploreMap. */
export type RenderMode = 'pins' | 'heatmap' | 'combined';

const AREA_LAYERS: LayerType[] = ['cities', 'countries', 'neighbourhoods'];

/** Map a lens to the ExploreMap point render mode. */
export function lensToRenderMode(lens: MapLens): RenderMode {
  if (lens === 'density') return 'heatmap';
  if (lens === 'combined') return 'combined';
  return 'pins';
}

/**
 * Resolve which entity layers ExploreMap should enable for a lens.
 * - boundary: area polygons only, seeded from the preset's area layers
 * - density: heatmap is computed from points, so restrict to venues + events
 * - pins / combined: the full enabled set (combined draws pins AND heatmap)
 */
export function exploreLayersFor(
  lens: MapLens,
  enabledLayers: LayerType[],
  configLayers: LayerType[],
): LayerType[] {
  if (lens === 'boundary') {
    const presetAreas = configLayers.filter((l) => AREA_LAYERS.includes(l));
    const seed = presetAreas.length > 0 ? presetAreas : (['cities'] as LayerType[]);
    return Array.from(
      new Set([...enabledLayers.filter((l) => AREA_LAYERS.includes(l)), ...seed]),
    );
  }
  if (lens === 'density') {
    return enabledLayers.filter((l) => l === 'venues' || l === 'events');
  }
  return enabledLayers;
}

/**
 * Decide what the heatmap effect should do for a render mode.
 * - wantHeatmap: add the heatmap layer (needs at least one point layer)
 * - hidePins: hide cluster/pin layers (only the pure-density lens does this;
 *   combined keeps pins on top of the heatmap)
 */
export function heatmapRenderPlan(
  renderMode: RenderMode,
  hasPointLayers: boolean,
): { wantHeatmap: boolean; hidePins: boolean } {
  return {
    wantHeatmap: renderMode !== 'pins' && hasPointLayers,
    hidePins: renderMode === 'heatmap',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/map/__tests__/mapShellAdapters.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/map/mapShellAdapters.ts src/components/map/__tests__/mapShellAdapters.test.ts
git commit -m "feat(map): pure adapters for lens render-mode, layer set, heatmap plan"
```

---

## Task 3: Combined lens icon in the LensPicker

**Files:**
- Modify: `src/components/map/LensPicker.tsx`
- Test: `src/components/map/__tests__/LensPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/map/__tests__/LensPicker.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LensPicker } from '@/components/map/LensPicker';

describe('LensPicker', () => {
  it('renders a Combined pill and marks the active lens', () => {
    render(
      <LensPicker
        lenses={['combined', 'pins', 'density']}
        value="combined"
        onChange={vi.fn()}
      />,
    );
    const combined = screen.getByRole('radio', { name: 'Combined' });
    expect(combined).toBeInTheDocument();
    expect(combined).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Pins' })).toHaveAttribute('aria-checked', 'false');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/map/__tests__/LensPicker.test.tsx`
Expected: FAIL — `LENS_ICONS[combined]` is `undefined`, so rendering the combined button throws (no icon component).

- [ ] **Step 3: Add the `Layers` icon mapping**

In `src/components/map/LensPicker.tsx`:

Change the lucide import line:
```tsx
import { MapPin, Activity, Route, Hexagon, Layers } from 'lucide-react';
```

Add the combined entry to `LENS_ICONS` (after `boundary`):
```tsx
  combined: Layers,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/map/__tests__/LensPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/map/LensPicker.tsx src/components/map/__tests__/LensPicker.test.tsx
git commit -m "feat(map): Combined lens pill (Layers icon) in LensPicker"
```

---

## Task 4: Wire MapShell to the adapter helpers

**Files:**
- Modify: `src/components/map/MapShell.tsx`

There is no new unit test here — the helpers are tested in Task 2; this task is a mechanical swap verified by typecheck and the existing MapShell render path. Keep the diff minimal.

- [ ] **Step 1: Import the helpers**

In `src/components/map/MapShell.tsx`, after the existing `import type { LayerType } ...` line (line 14), add:
```ts
import { lensToRenderMode, exploreLayersFor } from './mapShellAdapters';
```

- [ ] **Step 2: Replace the inline `exploreLayers` memo body**

Replace the memo at lines ~84-95:
```ts
  const exploreLayers: LayerType[] = useMemo(
    () => exploreLayersFor(state.lens, state.enabledLayers, config.layers),
    [state.lens, state.enabledLayers, config.layers],
  );
```

- [ ] **Step 3: Replace the inline `renderMode` prop**

Change the `renderMode` prop on `<ExploreMap>` (line ~212) from:
```tsx
        renderMode={state.lens === 'density' ? 'heatmap' : 'pins'}
```
to:
```tsx
        renderMode={lensToRenderMode(state.lens)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i MapShell.tsx || echo "MapShell typecheck clean"`
Expected: `MapShell typecheck clean`

- [ ] **Step 5: Commit**

```bash
git add src/components/map/MapShell.tsx
git commit -m "refactor(map): MapShell uses pure lens adapters"
```

---

## Task 5: ExploreMap renders the heatmap under the pins for the combined mode

**Files:**
- Modify: `src/components/map/ExploreMap.tsx`

- [ ] **Step 1: Import the helper and widen the prop type**

In `src/components/map/ExploreMap.tsx`, add the import near the other local imports (e.g. just below the `LAYER_COLORS` / `PRIDE_LAYER_COLORS` import block):
```ts
import { heatmapRenderPlan, type RenderMode } from './mapShellAdapters';
```

Change the `renderMode` prop type (line ~156) from:
```ts
  /** Rendering style for point data. `'pins'` (default) shows clusters + markers.
   *  `'heatmap'` swaps clusters/markers for a monochrome density layer. */
  renderMode?: 'pins' | 'heatmap';
```
to:
```ts
  /** Rendering style for point data. `'pins'` (default) shows clusters + markers.
   *  `'heatmap'` swaps clusters/markers for the density layer. `'combined'`
   *  draws the heatmap beneath the pins (both visible). */
  renderMode?: RenderMode;
```

Leave the default value `renderMode = 'pins'` (line ~177) as-is.

- [ ] **Step 2: Compute the render plan at the top of the heatmap effect**

In the heatmap effect, replace this line (line ~938):
```ts
    const wantHeatmap = renderMode === 'heatmap' && pointEnabledLayers.length > 0;
```
with:
```ts
    const { wantHeatmap, hidePins } = heatmapRenderPlan(
      renderMode,
      pointEnabledLayers.length > 0,
    );
```

- [ ] **Step 3: Set pin visibility from `hidePins` instead of always hiding**

Replace the "Hide pin/cluster layers while heatmap is active" block (lines ~950-953):
```ts
    // Hide pin/cluster layers while heatmap is active.
    for (const id of [CLUSTERS_LAYER, CLUSTER_COUNT_LAYER, UNCLUSTERED_LAYER]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }
```
with:
```ts
    // Pure density (`heatmap`) hides the pins; `combined` keeps them on top.
    const pinVisibility = hidePins ? 'none' : 'visible';
    for (const id of [CLUSTERS_LAYER, CLUSTER_COUNT_LAYER, UNCLUSTERED_LAYER]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', pinVisibility);
    }
```

- [ ] **Step 4: Insert the heatmap layer below the pins**

This is a minimal two-touch edit — do NOT re-indent the layer object. MapLibre's
signature is `addLayer(layer, beforeId?)`, so we only (a) add a `beforeId` const,
and (b) append `, beforeId` to the existing call's closing.

First, add the `beforeId` const immediately before the `map.addLayer({` call
(after the `map.addSource(HEATMAP_SOURCE, ...)` line, ~968):
```ts
    map.addSource(HEATMAP_SOURCE, { type: 'geojson', data: filteredGeoJSON });
    // Insert beneath the pin/cluster layers so markers stay on top in the
    // combined lens. `beforeId` is undefined when pins aren't mounted yet
    // (pure-density), which appends on top exactly as before.
    const beforeId = map.getLayer(CLUSTERS_LAYER) ? CLUSTERS_LAYER : undefined;
```

The `map.addLayer({` opening line and the entire layer/paint object stay exactly
as they are. Only change the call's closing — the `});` at line ~1018 (right
before the effect's dependency array). Change:
```ts
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.85, 14, 0.65, 16, 0],
      },
    });
  }, [renderMode, pointsGeoJSON, pointEnabledLayers, mapReady, pridePalette]);
```
to (only the `});` becomes `}, beforeId);`):
```ts
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.85, 14, 0.65, 16, 0],
      },
    }, beforeId);
  }, [renderMode, pointsGeoJSON, pointEnabledLayers, mapReady, pridePalette]);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i ExploreMap.tsx || echo "ExploreMap typecheck clean"`
Expected: `ExploreMap typecheck clean`

- [ ] **Step 6: Commit**

```bash
git add src/components/map/ExploreMap.tsx
git commit -m "feat(map): combined render mode draws heatmap under visible pins"
```

---

## Task 6: Full verification + manual prod-parity check

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors (pre-existing warnings in unrelated files are acceptable).

- [ ] **Step 3: Run the full map + hooks test scope**

Run: `npx vitest run src/components/map src/hooks`
Expected: all pass.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual check (dev server)**

Run: `npm run dev` (needs `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAP_SHELL=true`). Open `/map`.
Verify:
- The map lands on the **Combined** lens by default (Combined pill active in the lens picker).
- The rainbow heatmap is visible AND venue/event/hotel pins render on top of it.
- Switching to **Pins** removes the heatmap; switching to **Density** hides the pins and shows the full-strength rainbow heatmap.
- No `color expected` / `Could not parse color` console errors.

- [ ] **Step 6: Commit any fixups, then hand off for ship**

If steps 1-5 surfaced fixes, commit them:
```bash
git add -A
git commit -m "fix(map): combined lens verification fixups"
```
Otherwise the branch is ready to push + PR (existing claude/* auto-land flow).

---

## Self-Review notes

- **Spec coverage:** lens model (Task 1), render wiring incl. z-order + full layer set (Tasks 2,4,5), migration (Task 1 uses existing `parseLens` validation; no schema change), tests (Tasks 1-3 + Task 6 manual). Full-strength heatmap = no opacity change, which is exactly "leave the paint ramp/opacity as-is" — honored by Task 5 not touching the `heatmap-opacity`/`heatmap-color` stops.
- **Type consistency:** `RenderMode` defined once in `mapShellAdapters.ts`, imported by both ExploreMap and (implicitly via `lensToRenderMode`) MapShell. Helper names — `lensToRenderMode`, `exploreLayersFor`, `heatmapRenderPlan` — are used identically in tasks and tests.
- **No placeholders:** every code step shows the literal code or exact old→new edit.
