import { describe, it, expect } from 'vitest';
import { SURFACE_PRESETS } from '../MapShell.types';

describe('SURFACE_PRESETS', () => {
  it('every defaultEnabledLayers is a subset of its surface layers', () => {
    for (const [surface, config] of Object.entries(SURFACE_PRESETS)) {
      for (const layer of config.defaultEnabledLayers ?? []) {
        expect(config.layers, `${surface}.defaultEnabledLayers has ${layer}`).toContain(layer);
      }
    }
  });

  it('travel surface boots with its destination layers enabled', () => {
    // cities/neighbourhoods are `defaultOn: false` in the global LAYER_DEFS
    // seeding, so without defaultEnabledLayers this preset boots blank.
    const travel = SURFACE_PRESETS.travel;
    expect(travel.defaultEnabledLayers).toEqual(['cities', 'neighbourhoods', 'events']);
    // Destination altitude — venue dots stay on /map.
    expect(travel.layers).not.toContain('venues');
    expect(travel.enableUrlState).toBe(false);
  });
});
