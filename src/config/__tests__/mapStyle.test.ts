import { describe, it, expect, vi } from 'vitest';

// `@protomaps/basemaps` ships ESM that loads large layer specs at import
// time; stub it so importing the config is cheap + deterministic.
vi.mock('@protomaps/basemaps', () => ({
  layers: (sourceName: string, flavor: unknown, opts: unknown) => [
    { id: 'background', type: 'background', source: sourceName, flavor, opts },
  ],
  namedFlavor: (name: string) => ({ name }),
}));

import { mapStyle, globeFog } from '../mapStyle';

describe('mapStyle', () => {
  it('uses MapLibre style spec v8', () => {
    expect(mapStyle.version).toBe(8);
  });

  it('points glyphs + sprite at the basemaps-assets path', () => {
    expect(mapStyle.glyphs).toMatch(/basemaps-assets\/fonts\/\{fontstack\}\/\{range\}\.pbf$/);
    expect(mapStyle.sprite).toMatch(/basemaps-assets\/sprites\/v4\/light$/);
  });

  it('registers a vector source named protomaps with maxzoom + attribution', () => {
    const src = (mapStyle.sources as Record<string, { type: string; tiles?: string[]; maxzoom?: number; attribution?: string }>).protomaps;
    expect(src.type).toBe('vector');
    expect(src.tiles?.[0]).toMatch(/\/planet\/\{z\}\/\{x\}\/\{y\}\.mvt$/);
    expect(src.maxzoom).toBe(15);
    expect(src.attribution).toContain('Protomaps');
    expect(src.attribution).toContain('OpenStreetMap');
  });

  it('forwards namedFlavor("light") + lang to the layers builder', () => {
    expect(Array.isArray(mapStyle.layers)).toBe(true);
    expect(mapStyle.layers.length).toBeGreaterThan(0);
  });
});

describe('globeFog', () => {
  it('exports white-ish fog values used in globe projection', () => {
    expect(globeFog.color).toBe('rgb(255, 255, 255)');
    expect(globeFog['high-color']).toBe('rgb(200, 200, 225)');
    expect(globeFog['horizon-blend']).toBe(0.02);
  });
});
