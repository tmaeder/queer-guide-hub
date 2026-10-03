import { describe, it, expect } from 'vitest';
import {
  MAP_LINES,
  MAP_LINE_IDS,
  MAP_VIEW_IDS,
  ENTITY_BULLET,
  lineFor,
  lineTrack,
  fetchLayersForLines,
  layerForEntityKey,
  isAreaLayer,
  type MapLine,
} from '../mapDomain';
import { AREA_LAYERS, LAYER_DEFS } from '@/config/mapLayers';
import { VENUE_CATEGORIES } from '@/lib/venueCategories';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';
import type { LayerType } from '@/hooks/useExploreMapData';

/**
 * The line registry's gate.
 *
 * Two of these assertions are the structural halves of invariants the plan
 * names, and both have a vacuous form that had to be avoided:
 *
 * - "areas are never a top-level line" cannot be asserted as
 *   `expect(MAP_LINE_IDS).not.toContain('areas')` — that is a tautology over a
 *   hand-written union which TypeScript already rejects. The real failure is an
 *   area-backed LAYER reaching a line's membership, so it is asserted over
 *   `lineFor` and over `fetchLayersForLines`.
 * - "the four lines partition the point layers" is satisfied perfectly by a
 *   classifier that answers `M` for everything. The positive control is that
 *   the image is exactly the four-member set AND every line is non-empty.
 */

const POINT_LAYERS = LAYER_DEFS.map((d) => d.type).filter((t) => !AREA_LAYERS.includes(t));

describe('line classification', () => {
  it('resolves a line for every legal venue category', () => {
    // The Record in mapDomain makes this compile-time; the loop makes the
    // failure readable and catches a category added with a bogus value.
    for (const category of VENUE_CATEGORIES) {
      const line = lineFor('venues', category);
      expect(line, `venues/${category} resolved no line`).not.toBeNull();
      expect(MAP_LINE_IDS, `venues/${category} resolved "${line}"`).toContain(line);
    }
  });

  it('routes care and stay categories off the venues line', () => {
    expect(lineFor('venues', 'community_center')).toBe('C');
    expect(lineFor('venues', 'toilet')).toBe('C');
    expect(lineFor('venues', 'hotel')).toBe('T');
    // The rest stay on M — spot-check the ones a reader would expect to move.
    for (const c of ['bar', 'club', 'sauna', 'cruising', 'shop', 'gallery', 'gym'] as const) {
      expect(lineFor('venues', c), `${c} should stay on M`).toBe('M');
    }
  });

  it('maps the non-venue point layers straight to a line', () => {
    expect(lineFor('events')).toBe('E');
    expect(lineFor('restrooms')).toBe('C');
    expect(lineFor('hotels')).toBe('T');
  });

  it('gives an uncategorised venue a line rather than dropping it', () => {
    // A row whose category predates a vocabulary change still has to render.
    expect(lineFor('venues', null)).toBe('M');
    expect(lineFor('venues', undefined)).toBe('M');
    expect(lineFor('venues', 'not-a-real-category')).toBe('M');
  });

  it('puts NO area layer on a line', () => {
    // Invariant B, structural half. Asserted over the classifier, not over the
    // line union — see the file head.
    for (const layer of AREA_LAYERS) {
      expect(lineFor(layer), `${layer} must not be on a line`).toBeNull();
      expect(isAreaLayer(layer)).toBe(true);
    }
  });

  it('partitions the point layers across the four lines', () => {
    const reached = new Set<MapLine | null>();
    for (const layer of POINT_LAYERS) {
      if (layer === 'venues') {
        for (const c of VENUE_CATEGORIES) reached.add(lineFor(layer, c));
      } else {
        reached.add(lineFor(layer));
      }
    }
    // THE POSITIVE CONTROL. "Every layer resolves a line" is satisfied by a
    // classifier that answers M for everything; this is not.
    expect([...reached].sort()).toEqual([...MAP_LINE_IDS].sort());
    expect(reached.has(null), 'a point layer resolved no line').toBe(false);
  });
});

describe('line palette', () => {
  it('gives the four lines four DIFFERENT tracks', () => {
    const tracks = MAP_LINE_IDS.map(lineTrack);
    expect(new Set(tracks).size, `tracks collided: ${tracks.join()}`).toBe(4);
  });

  it('borrows every track from ROUTE_BULLET_MAP rather than a second table', () => {
    // If someone re-introduces a line-local palette, these stop agreeing.
    for (const line of MAP_LINE_IDS) {
      const key = MAP_LINES[line].bulletKey;
      expect(ROUTE_BULLET_MAP[key], `${line} cites unknown bullet key "${key}"`).toBeDefined();
      expect(lineTrack(line)).toBe(ROUTE_BULLET_MAP[key].track);
    }
  });

  it('holds no colour literal in the registry', () => {
    const serialised = JSON.stringify(MAP_LINES);
    expect(serialised).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(serialised).not.toMatch(/hsl\(|rgb\(/);
  });

  it('gives each line a unique cluster count property', () => {
    // A collision silently merges two donut segments — the aggregate, the
    // donut and the hover text all read these names.
    const props = MAP_LINE_IDS.map((l) => MAP_LINES[l].countProp);
    expect(new Set(props).size).toBe(props.length);
  });

  it('declares exactly four lines and four views', () => {
    expect(MAP_LINE_IDS).toHaveLength(4);
    expect(MAP_VIEW_IDS).toHaveLength(4);
    expect(MAP_VIEW_IDS).not.toContain('combined');
  });
});

describe('fetch layers for lines', () => {
  it('never asks for an area layer', () => {
    // Invariant B again, from the fetch side: a line whose membership leaked an
    // area layer would show up here even if `lineFor` looked clean.
    for (const line of MAP_LINE_IDS) {
      const leaked = fetchLayersForLines([line]).filter((l) => AREA_LAYERS.includes(l));
      expect(leaked, `${line} pulls area layer(s)`).toEqual([]);
    }
  });

  it('covers exactly the point layers when every line is on', () => {
    // The companion control: without this, `fetchLayers: []` on every line
    // would satisfy the assertion above perfectly.
    expect(fetchLayersForLines([...MAP_LINE_IDS]).sort()).toEqual([...POINT_LAYERS].sort());
  });

  it('needs `venues` for each of M, C and T', () => {
    for (const line of ['M', 'C', 'T'] as const) {
      expect(fetchLayersForLines([line]), `${line} must fetch venues`).toContain('venues');
    }
  });

  it('does not change the fetch set when M is toggled off', () => {
    // THE NO-REFETCH PROPERTY, stated as data. `layersKey` in the refetch
    // effect is derived from this set, so if dropping M changed it the map
    // would hit the network on a pure render toggle.
    const withM = fetchLayersForLines(['M', 'C', 'T']).sort();
    const withoutM = fetchLayersForLines(['C', 'T']).sort();
    expect(withoutM).toEqual(withM);
  });

  it('does drop a layer no remaining line needs', () => {
    // The other direction, so the assertion above cannot be satisfied by a
    // function that ignores its argument.
    expect(fetchLayersForLines(['T'])).toContain('hotels');
    expect(fetchLayersForLines(['M'])).not.toContain('hotels');
    expect(fetchLayersForLines(['M'])).not.toContain('restrooms');
  });

  it('de-duplicates `venues` across lines', () => {
    const layers = fetchLayersForLines(['M', 'C', 'T']);
    expect(layers.filter((l) => l === 'venues')).toHaveLength(1);
  });
});

describe('entity bullets', () => {
  it('covers every layer exactly once', () => {
    const layers = LAYER_DEFS.map((d) => d.type);
    expect(Object.keys(ENTITY_BULLET).sort()).toEqual([...layers].sort());
    expect(new Set(Object.values(ENTITY_BULLET)).size).toBe(layers.length);
  });

  it('resolves every bullet key in ROUTE_BULLET_MAP', () => {
    for (const [layer, key] of Object.entries(ENTITY_BULLET)) {
      expect(ROUTE_BULLET_MAP[key], `${layer} → "${key}" is not a bullet`).toBeDefined();
    }
  });

  it('keeps the one join de-pluralising cannot produce', () => {
    expect(ENTITY_BULLET.neighbourhoods).toBe('queer_village');
  });

  it('round-trips both spellings back to a layer', () => {
    // Callers hold both: search results are singular, the map is plural.
    for (const layer of Object.keys(ENTITY_BULLET) as LayerType[]) {
      expect(layerForEntityKey(ENTITY_BULLET[layer])).toBe(layer);
      expect(layerForEntityKey(layer)).toBe(layer);
    }
  });

  it('returns undefined for an unknown key rather than guessing', () => {
    expect(layerForEntityKey('personality')).toBeUndefined();
    expect(layerForEntityKey('')).toBeUndefined();
  });
});
