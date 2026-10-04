import { describe, expect, it } from 'vitest';
import {
  areaLayersForSurface,
  fetchLayersForPlan,
  viewRenderPlan,
} from '@/components/map/mapShellAdapters';
import { MAP_LINE_IDS, MAP_VIEW_IDS, type MapLine } from '@/components/map/mapDomain';
import { SURFACE_PRESETS } from '@/components/map/MapShell.types';
import {
  HEATMAP_LAYER,
  HEAT_OPACITY_FULL,
  HEAT_OPACITY_WASH,
  PIN_LAYER_IDS,
  ROUTE_LAYER_IDS,
} from '@/config/mapLayers';

/** Every subset of the four lines, INCLUDING the empty one — a lazy
 *  implementation shrugs on `[]` and returns the stations plan. */
function allSubsets<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((acc, item) => [...acc, ...acc.map((s) => [...s, item])], [[]]);
}

const SUBSETS = allSubsets(MAP_LINE_IDS);

describe('viewRenderPlan — total over every view × every line subset', () => {
  it('answers for all four views and never throws', () => {
    for (const view of MAP_VIEW_IDS) {
      for (const lines of SUBSETS) {
        for (const hasRoute of [true, false]) {
          const plan = viewRenderPlan(view, lines, hasRoute);
          expect(typeof plan.stations).toBe('boolean');
          expect(['off', 'full', 'wash']).toContain(plan.heat);
          expect(Array.isArray(plan.layers)).toBe(true);
        }
      }
    }
  });

  it('scopes 16 line subsets, not 4 — the empty set is in the sweep', () => {
    // THE POSITIVE CONTROL for every loop above. `allSubsets` returning `[[]]`
    // or `[MAP_LINE_IDS]` would make all of them pass while testing one case.
    expect(SUBSETS).toHaveLength(16);
    expect(SUBSETS.some((s) => s.length === 0)).toBe(true);
    expect(SUBSETS.some((s) => s.length === 4)).toBe(true);
  });

  it('mounts the heat source on stations, at WASH', () => {
    const plan = viewRenderPlan('stations', MAP_LINE_IDS, false);
    expect(plan.stations).toBe(true);
    expect(plan.heat).toBe('wash');
    expect(plan.layers).toContain(HEATMAP_LAYER);
  });

  it('hides every pin on heat and on areas', () => {
    expect(viewRenderPlan('heat', MAP_LINE_IDS, false).stations).toBe(false);
    expect(viewRenderPlan('areas', MAP_LINE_IDS, false).stations).toBe(false);
    for (const id of PIN_LAYER_IDS) {
      expect(viewRenderPlan('heat', MAP_LINE_IDS, false).layers).not.toContain(id);
      expect(viewRenderPlan('areas', MAP_LINE_IDS, false).layers).not.toContain(id);
    }
  });

  it('draws areas on areas and nowhere else — both directions', () => {
    expect(viewRenderPlan('areas', MAP_LINE_IDS, false).areas).toBe(true);
    for (const view of MAP_VIEW_IDS.filter((v) => v !== 'areas')) {
      expect(viewRenderPlan(view, MAP_LINE_IDS, true).areas).toBe(false);
    }
  });
});

/**
 * HARD INVARIANT A — Routes must never fall through to Stations.
 *
 * The naive `expect(plan('routes')).not.toEqual(plan('stations'))` fails both
 * ways: it is RED ON ARRIVAL (before this change both yielded `'pins'`, and a
 * test red on day one gets `.skip`ed), and once the two differ by ANY field it
 * passes on nothing while the canvas still draws only pins. So the assertion
 * is structural and runs over every line subset.
 */
describe('invariant A — Routes never falls through to Stations', () => {
  it('mounts every route layer for every line subset, including the empty one', () => {
    for (const lines of SUBSETS) {
      const plan = viewRenderPlan('routes', lines, true);
      expect(plan.routes).toBe(true);
      expect(plan.layers).toEqual(expect.arrayContaining(ROUTE_LAYER_IDS));
    }
  });

  it('the route layers are the difference-maker, not an incidental field', () => {
    const routes = viewRenderPlan('routes', MAP_LINE_IDS, true);
    const stations = viewRenderPlan('stations', MAP_LINE_IDS, false);
    const stripped = routes.layers.filter((l) => !ROUTE_LAYER_IDS.includes(l));
    expect(stripped).not.toEqual(stations.layers);
  });

  it('with no route it draws NOTHING rather than reverting to pins', () => {
    for (const lines of SUBSETS) {
      const plan = viewRenderPlan('routes', lines, false);
      expect(plan.routes).toBe(false);
      expect(plan.stations).toBe(false);
      expect(plan.layers).toEqual([]);
      // and specifically not the stations plan
      expect(plan.layers).not.toContain(HEATMAP_LAYER);
    }
  });
});

describe('the two heat ramps', () => {
  it('are monotone non-increasing in zoom', () => {
    for (const ramp of [HEAT_OPACITY_FULL, HEAT_OPACITY_WASH]) {
      for (let i = 1; i < ramp.length; i++) {
        expect(ramp[i][0]).toBeGreaterThan(ramp[i - 1][0]);
        expect(ramp[i][1]).toBeLessThanOrEqual(ramp[i - 1][1]);
      }
    }
  });

  it('WASH never exceeds FULL at any shared stop, and is gone by z10', () => {
    const at = (ramp: [number, number][], z: number): number => {
      // linear interpolation, the same thing MapLibre does
      if (z <= ramp[0][0]) return ramp[0][1];
      if (z >= ramp[ramp.length - 1][0]) return ramp[ramp.length - 1][1];
      for (let i = 1; i < ramp.length; i++) {
        if (z <= ramp[i][0]) {
          const [z0, o0] = ramp[i - 1];
          const [z1, o1] = ramp[i];
          return o0 + ((o1 - o0) * (z - z0)) / (z1 - z0);
        }
      }
      return 0;
    };
    for (let z = 0; z <= 18; z++) {
      expect(at(HEAT_OPACITY_WASH, z)).toBeLessThanOrEqual(at(HEAT_OPACITY_FULL, z) + 1e-9);
    }
    // The whole point of the wash: it clears before individual stations are
    // legible, so the two never compete for the same ground.
    expect(at(HEAT_OPACITY_WASH, 10)).toBe(0);
    expect(at(HEAT_OPACITY_FULL, 10)).toBeGreaterThan(0);
  });
});

describe('the fetch set', () => {
  it('does not change when a line is toggled off', () => {
    // The no-refetch property, stated as data: C and T both need `venues`, so
    // switching M off leaves it in the fetch set and `layersKey` is stable.
    const config = SURFACE_PRESETS.discover;
    const plan = viewRenderPlan('stations', MAP_LINE_IDS, false);
    const all = fetchLayersForPlan(plan, MAP_LINE_IDS, config).sort();
    const withoutM = fetchLayersForPlan(plan, ['C', 'T'] as MapLine[], config).sort();
    expect(withoutM).toEqual(expect.arrayContaining(['venues']));
    expect(fetchLayersForPlan(plan, ['M', 'C', 'T'] as MapLine[], config).sort()).toEqual(
      withoutM,
    );
    expect(all.length).toBeGreaterThan(withoutM.length); // E adds `events`
  });

  it('adds area layers only on the areas view', () => {
    const config = SURFACE_PRESETS.discover;
    const areas = fetchLayersForPlan(
      viewRenderPlan('areas', MAP_LINE_IDS, false),
      MAP_LINE_IDS,
      config,
    );
    expect(areas).toEqual(expect.arrayContaining(['cities']));
    for (const view of ['stations', 'heat'] as const) {
      const set = fetchLayersForPlan(viewRenderPlan(view, MAP_LINE_IDS, false), MAP_LINE_IDS, config);
      expect(set).not.toContain('cities');
      expect(set).not.toContain('countries');
      expect(set).not.toContain('neighbourhoods');
    }
  });

  it('falls back to cities rather than drawing nothing', () => {
    expect(areaLayersForSurface({ ...SURFACE_PRESETS.venues, areaLayers: undefined })).toEqual([
      'cities',
    ]);
    expect(areaLayersForSurface({ ...SURFACE_PRESETS.venues, areaLayers: [] })).toEqual(['cities']);
  });
});
