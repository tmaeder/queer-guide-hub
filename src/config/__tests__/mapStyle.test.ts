/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';

// `@protomaps/basemaps` ships ESM that loads large layer specs at import
// time; stub it so importing the config is cheap + deterministic. The stub
// echoes the flavor back so we can assert what we handed it.
vi.mock('@protomaps/basemaps', () => ({
  layers: (sourceName: string, flavor: unknown, opts: unknown) => [
    { id: 'background', type: 'background', source: sourceName, flavor, opts },
  ],
}));

import { getMapStyle, globeFog, MAP_FONT_REGULAR, MAP_FONT_BOLD } from '../mapStyle';

describe('getMapStyle', () => {
  it('uses MapLibre style spec v8', () => {
    expect(getMapStyle().version).toBe(8);
  });

  it('points glyphs + sprite at the basemaps-assets path', () => {
    expect(getMapStyle().glyphs).toMatch(/basemaps-assets\/fonts\/\{fontstack\}\/\{range\}\.pbf$/);
    expect(getMapStyle().sprite).toMatch(/basemaps-assets\/sprites\/v4\/light$/);
  });

  it('registers a vector source named protomaps with maxzoom + attribution', () => {
    const src = (
      getMapStyle().sources as Record<
        string,
        { type: string; tiles?: string[]; maxzoom?: number; attribution?: string }
      >
    ).protomaps;
    expect(src.type).toBe('vector');
    expect(src.tiles?.[0]).toMatch(/\/planet\/\{z\}\/\{x\}\/\{y\}\.mvt$/);
    expect(src.maxzoom).toBe(15);
    expect(src.attribution).toContain('Protomaps');
    expect(src.attribution).toContain('OpenStreetMap');
  });

  it('caches (same reference on repeat calls)', () => {
    expect(getMapStyle()).toBe(getMapStyle());
  });

  it('hands the layers builder our own flavor, not a named Protomaps one', () => {
    const layer = (getMapStyle().layers as Array<{ flavor?: Record<string, unknown> }>)[0];
    // Stock `namedFlavor('light')` is gone: it painted blue water, green
    // landcover and orange shields under the pins. Ours is paper + ink.
    expect(layer.flavor).toBeTruthy();
    expect(layer.flavor).toHaveProperty('background');
    expect(layer.flavor).toHaveProperty('water');
    expect(layer.flavor).not.toHaveProperty('name');
  });
});

describe('map label fontstacks', () => {
  it('falls back to Noto when no asset mirror is configured', () => {
    // A fontstack that 404s makes MapLibre drop EVERY label on the map, so the
    // Space Grotesk stacks are only claimed once VITE_BASEMAP_ASSETS_URL points
    // at a mirror that has them (see scripts/build-map-glyphs.sh).
    expect(import.meta.env.VITE_BASEMAP_ASSETS_URL).toBeFalsy();
    expect(MAP_FONT_REGULAR).toBe('Noto Sans Regular');
    expect(MAP_FONT_BOLD).toBe('Noto Sans Medium');
  });
});

describe('globeFog', () => {
  it('is paper and ink, with no blue rim', () => {
    const fog = globeFog();
    expect(fog.color).toMatch(/^hsl\(/);
    expect(fog['high-color']).toMatch(/^hsl\(/);
    expect(fog['horizon-blend']).toBe(0.02);
  });
});
