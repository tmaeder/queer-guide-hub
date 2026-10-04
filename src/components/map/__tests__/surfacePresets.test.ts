import { describe, it, expect } from 'vitest';
import { SURFACE_PRESETS } from '../MapShell.types';
import { MAP_LINES, MAP_LINE_IDS, MAP_VIEW_IDS } from '../mapDomain';
import { AREA_LAYERS, LAYER_DEFS } from '@/config/mapLayers';

const SURFACES = Object.entries(SURFACE_PRESETS);

describe('SURFACE_PRESETS', () => {
  it('covers eight surfaces — the positive control for every loop below', () => {
    expect(SURFACES.length).toBe(8);
  });

  it('every defaultLines is a subset of its surface lines', () => {
    for (const [surface, config] of SURFACES) {
      for (const line of config.defaultLines ?? []) {
        expect(config.lines, `${surface}.defaultLines has ${line}`).toContain(line);
      }
    }
  });

  it('every surface offers its own defaultView', () => {
    for (const [surface, config] of SURFACES) {
      expect(config.views, `${surface}.defaultView`).toContain(config.defaultView);
    }
  });

  it('`combined` appears in no preset — the vocabulary is retired', () => {
    for (const [surface, config] of SURFACES) {
      expect(config.views as string[], surface).not.toContain('combined');
      expect(config.defaultView as string, surface).not.toBe('combined');
    }
  });

  it('travel stays at destination altitude', () => {
    const travel = SURFACE_PRESETS.travel;
    // The E line plus geography; venue dots stay on /map.
    expect(travel.lines).toEqual(['E']);
    expect(travel.lines).not.toContain('M');
    expect(travel.areaLayers).toEqual(['cities', 'neighbourhoods']);
    expect(travel.enableUrlState).toBe(false);
  });

  it('trip is REVIVED and offers Routes — stage 4 needs this call site', () => {
    // Deleting this preset before Routes had a branch is what made
    // `surface="trip"` unreachable; it is the only surface whose DEFAULT is
    // the routes view.
    expect(SURFACE_PRESETS.trip.views).toContain('routes');
    expect(SURFACE_PRESETS.trip.defaultView).toBe('routes');
  });
});

/**
 * HARD INVARIANT B — Areas must never appear as a top-level line.
 *
 * `expect(MAP_LINE_IDS).not.toContain('areas')` is a tautology over a
 * hand-written union; TypeScript already rejects it. The real failure is an
 * AREA-BACKED LAYER inside a line's membership — plausible, because the
 * `travel` preset used to boot `['cities','neighbourhoods','events']` as its
 * layer list.
 */
describe('invariant B — geography is a view, never a line', () => {
  it('no line fetches an area layer', () => {
    for (const line of MAP_LINE_IDS) {
      for (const layer of MAP_LINES[line].fetchLayers) {
        expect(AREA_LAYERS, `line ${line}`).not.toContain(layer);
      }
    }
  });

  it('THE POSITIVE CONTROL: the lines cover exactly the non-area layers', () => {
    // Without this, `fetchLayers: []` on every line satisfies the assertion
    // above perfectly while the map fetches nothing.
    const reached = [...new Set(MAP_LINE_IDS.flatMap((l) => MAP_LINES[l].fetchLayers))].sort();
    const expected = LAYER_DEFS.map((d) => d.type)
      .filter((t) => !AREA_LAYERS.includes(t))
      .sort();
    expect(reached).toEqual(expected);
  });

  it('area layers live in `areaLayers` and are area layers', () => {
    // Both directions: the areas slot holds only area layers, and a surface
    // that offers the areas view has something to draw there.
    for (const [surface, config] of SURFACES) {
      for (const layer of config.areaLayers ?? []) {
        expect(AREA_LAYERS, `${surface}.areaLayers`).toContain(layer);
      }
      if (config.views.includes('areas') && config.areaLayers) {
        expect(config.areaLayers.length, `${surface} offers areas`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * A `points` / `route` surface supplies PRE-FILTERED stations, so the
 * client-side narrowing in `useViewportPoints` never runs. A filter chip there
 * would claim to narrow and not narrow — `filters: []` is the contract.
 */
describe('explicit-source surfaces declare no filters', () => {
  it('search and trip expose no filter chips', () => {
    expect(SURFACE_PRESETS.search.filters).toEqual([]);
    expect(SURFACE_PRESETS.trip.filters).toEqual([]);
  });

  it('viewport surfaces still DO expose filters — the control', () => {
    // Otherwise "no filters anywhere" would satisfy the assertion above.
    expect(SURFACE_PRESETS.discover.filters.length).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.venues.filters.length).toBeGreaterThan(0);
  });
});

/**
 * The pinned canary: /admin takes a preset with no `configOverride`, so it is
 * the one surface guaranteed to exercise whatever the registry grows. A view
 * or line that renders nowhere else is reachable there first.
 */
describe('admin is a superset of every other surface', () => {
  it('offers every view any surface offers, and every view that exists', () => {
    const admin = SURFACE_PRESETS.admin;
    for (const [surface, config] of SURFACES) {
      for (const view of config.views) {
        expect(admin.views, `${surface} offers ${view}`).toContain(view);
      }
    }
    expect([...admin.views].sort()).toEqual([...MAP_VIEW_IDS].sort());
  });

  it('offers every line any surface offers, and every line that exists', () => {
    const admin = SURFACE_PRESETS.admin;
    for (const [surface, config] of SURFACES) {
      for (const line of config.lines) {
        expect(admin.lines, `${surface} offers ${line}`).toContain(line);
      }
    }
    expect([...admin.lines].sort()).toEqual([...MAP_LINE_IDS].sort());
  });
});
