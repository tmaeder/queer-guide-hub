import { describe, expect, it } from 'vitest';
import {
  LEGACY_LAYER_TO_LINE,
  LEGACY_LENS_TO_VIEW,
  migratePrefs,
  readLines,
  readView,
  stripLegacy,
  type LegacyLens,
} from '@/components/map/mapLegacyUrl';
import { MAP_LINE_IDS, MAP_VIEW_IDS, type MapLine, type MapView } from '@/components/map/mapDomain';
import { AREA_LAYERS, LAYER_DEFS } from '@/config/mapLayers';

const ALL_VIEWS: MapView[] = [...MAP_VIEW_IDS];
const ALL_LINES: MapLine[] = [...MAP_LINE_IDS];
const getter = (sp: URLSearchParams) => (k: string) => sp.get(k);

describe('the legacy lens vocabulary', () => {
  const LENSES: LegacyLens[] = ['pins', 'density', 'routes', 'boundary', 'combined'];

  it('translates all five, and every one lands on a real view', () => {
    for (const lens of LENSES) {
      const sp = new URLSearchParams({ lens });
      const view = readView(getter(sp), ALL_VIEWS, 'stations');
      expect(MAP_VIEW_IDS).toContain(view);
      expect(view).toBe(LEGACY_LENS_TO_VIEW[lens]);
    }
  });

  it('collapses `combined` onto stations — that is what it was', () => {
    // pins + a heat underglow, which the stations view now does by default.
    expect(LEGACY_LENS_TO_VIEW.combined).toBe('stations');
    expect(LEGACY_LENS_TO_VIEW.pins).toBe('stations');
  });

  it('covers the whole retired vocabulary — the positive control', () => {
    // Without this, a table with one entry satisfies every loop above.
    expect(Object.keys(LEGACY_LENS_TO_VIEW).sort()).toEqual([...LENSES].sort());
  });
});

describe('the legacy layer vocabulary', () => {
  it('names every layer the registry knows — no silent gap', () => {
    // A layer missing from the table would translate to `undefined`, be
    // filtered out, and look exactly like an area layer.
    const known = LAYER_DEFS.map((d) => d.type).sort();
    expect(Object.keys(LEGACY_LAYER_TO_LINE).sort()).toEqual(known);
  });

  it('maps every AREA layer to null — invariant B expressed as data', () => {
    for (const l of AREA_LAYERS) expect(LEGACY_LAYER_TO_LINE[l]).toBeNull();
  });

  it('maps every POINT layer to a real line', () => {
    const points = LAYER_DEFS.map((d) => d.type).filter((t) => !AREA_LAYERS.includes(t));
    const reached = new Set(points.map((p) => LEGACY_LAYER_TO_LINE[p]));
    expect(reached.has(null)).toBe(false);
    // and the four lines are all reachable, so no line is unaddressable from
    // a legacy URL
    expect([...reached].sort()).toEqual([...ALL_LINES].sort());
  });
});

describe('the full 5 × 7 product', () => {
  const LENSES: LegacyLens[] = ['pins', 'density', 'routes', 'boundary', 'combined'];
  const LAYERS = LAYER_DEFS.map((d) => d.type);

  it('never throws and never yields an empty line set', () => {
    for (const lens of LENSES) {
      for (const layer of LAYERS) {
        const sp = new URLSearchParams({ lens, layers: layer });
        const view = readView(getter(sp), ALL_VIEWS, 'stations');
        const lines = readLines(getter(sp), ALL_LINES, ['M']);
        expect(MAP_VIEW_IDS).toContain(view);
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) expect(MAP_LINE_IDS).toContain(l);
      }
    }
  });

  it('exercises 35 pairs, not 1 — the positive control', () => {
    expect(LENSES.length * LAYERS.length).toBe(35);
  });
});

describe('read precedence is ONE-WAY', () => {
  it('prefers the new key when both are present', () => {
    const sp = new URLSearchParams({ view: 'heat', lens: 'boundary' });
    expect(readView(getter(sp), ALL_VIEWS, 'stations')).toBe('heat');
  });

  it('prefers `lines` over `layers`', () => {
    const sp = new URLSearchParams({ lines: 'C', layers: 'venues,events' });
    expect(readLines(getter(sp), ALL_LINES, ALL_LINES)).toEqual(['C']);
  });

  it('is idempotent — new params pass through unchanged', () => {
    for (const view of ALL_VIEWS) {
      const sp = new URLSearchParams({ view, lines: 'M,E' });
      expect(readView(getter(sp), ALL_VIEWS, 'areas')).toBe(view);
      expect(readLines(getter(sp), ALL_LINES, ALL_LINES)).toEqual(['M', 'E']);
    }
  });
});

describe('an empty translation falls back to the surface default, never []', () => {
  it('`layers=cities` yields the default rather than a blank map', () => {
    // Zero lines translated. Returning `[]` renders nothing — the same bug
    // class as the `savedLayers.length > 0` guard in useMapShellState.
    const sp = new URLSearchParams({ layers: 'cities,countries,neighbourhoods' });
    expect(readLines(getter(sp), ALL_LINES, ['M', 'E'])).toEqual(['M', 'E']);
  });

  it('an unknown value is ignored rather than rendered', () => {
    const sp = new URLSearchParams({ view: 'teleport', lens: 'hologram', lines: 'Z,Q' });
    expect(readView(getter(sp), ALL_VIEWS, 'areas')).toBe('areas');
    expect(readLines(getter(sp), ALL_LINES, ['T'])).toEqual(['T']);
  });

  it('a view the surface does not offer falls back', () => {
    const sp = new URLSearchParams({ view: 'routes' });
    expect(readView(getter(sp), ['stations', 'heat'], 'stations')).toBe('stations');
  });

  it('a line the surface does not offer is dropped, not substituted', () => {
    const sp = new URLSearchParams({ lines: 'M,E,C,T' });
    expect(readLines(getter(sp), ['M'], ['M'])).toEqual(['M']);
  });

  it('deduplicates rather than drawing a line twice', () => {
    const sp = new URLSearchParams({ layers: 'venues,venues' });
    expect(readLines(getter(sp), ALL_LINES, ALL_LINES)).toEqual(['M']);
  });
});

describe('stripLegacy', () => {
  it('removes both legacy keys and touches nothing else', () => {
    const sp = new URLSearchParams({
      lens: 'density',
      layers: 'venues',
      view: 'heat',
      lines: 'M',
      lat: '52.5',
      q: 'sauna',
    });
    stripLegacy(sp);
    expect(sp.get('lens')).toBeNull();
    expect(sp.get('layers')).toBeNull();
    expect(sp.get('view')).toBe('heat');
    expect(sp.get('lines')).toBe('M');
    expect(sp.get('lat')).toBe('52.5');
    expect(sp.get('q')).toBe('sauna');
  });
});

describe('prefs migrate on read', () => {
  it('translates a blob written under the old vocabulary', () => {
    expect(migratePrefs({ lens: 'boundary', enabledLayers: ['venues', 'hotels'] })).toEqual({
      view: 'areas',
      lines: ['M', 'T'],
    });
  });

  it('prefers an already-migrated blob', () => {
    expect(migratePrefs({ view: 'heat', lens: 'pins', lines: ['C'] })).toEqual({
      view: 'heat',
      lines: ['C'],
    });
  });

  it('yields nothing rather than a wrong default for junk', () => {
    expect(migratePrefs(null)).toEqual({});
    expect(migratePrefs('nope')).toEqual({});
    expect(migratePrefs({ lens: 'hologram', enabledLayers: ['cities'] })).toEqual({});
  });
});
