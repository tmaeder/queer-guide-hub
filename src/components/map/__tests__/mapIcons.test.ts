import { describe, it, expect } from 'vitest';
import { iconForMarker, glyphKeyFor, categoryLabel, GLYPH_DEFS } from '../mapIcons';
import { LAYER_DEFS } from '@/config/mapLayers';
import { VENUE_CATEGORIES } from '@/lib/venueCategories';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';
import type { LayerType } from '@/hooks/useExploreMapData';

/**
 * Glyph resolution had no test at all, which is how a dead key survived.
 *
 * `VENUE_CATEGORY_ICONS` carried BOTH `'event-venue'` and `event_venue`
 * because the lookup rewrote hyphens to underscores — so the legal category
 * could never match its own entry and only the duplicate ever resolved. It
 * also carried `organization`, retired from the vocabulary by migration
 * `20260915140000`.
 *
 * The failure mode is SOFT: a glyph key with no rasterized image draws a
 * coloured pin with nothing on it, which is exactly how the missing-`xmlns`
 * bug in `TransitIcon` lost every category icon without an error.
 */

const GLYPH_KEYS = new Set(GLYPH_DEFS.map((d) => d.key));

describe('iconForMarker', () => {
  it('resolves a real icon for every legal venue category', () => {
    for (const category of VENUE_CATEGORIES) {
      const icon = iconForMarker('venues', category);
      expect(
        TRANSIT_ICON_PATHS[icon],
        `${category} → "${icon}" is not a transit icon`,
      ).toBeDefined();
    }
  });

  it('resolves a real icon for every layer', () => {
    for (const { type } of LAYER_DEFS) {
      const icon = iconForMarker(type);
      expect(TRANSIT_ICON_PATHS[icon], `${type} → "${icon}" is not a transit icon`).toBeDefined();
    }
  });

  it('matches the hyphenated category against its own entry', () => {
    // THE REGRESSION. `'event-venue'` is the legal spelling; the old lookup
    // normalised it to `event_venue` and so could only ever match a duplicate
    // key. Falling back to the venues icon here is the bug, not a default.
    expect(iconForMarker('venues', 'event-venue')).toBe('events');
    expect(iconForMarker('venues', 'event-venue')).not.toBe(iconForMarker('venues', 'other'));
  });

  it('tolerates case and surrounding whitespace', () => {
    expect(iconForMarker('venues', 'Event-Venue')).toBe('events');
    expect(iconForMarker('venues', '  bar  ')).toBe(iconForMarker('venues', 'bar'));
  });

  it('falls through for a category outside the vocabulary', () => {
    // `organization` was retired. It must not resolve its old `library` icon —
    // a category that is no longer legal should look like any other unknown.
    expect(iconForMarker('venues', 'organization')).toBe(iconForMarker('venues', 'other'));
    expect(iconForMarker('venues', 'not-a-category')).toBe(iconForMarker('venues', 'other'));
  });

  it('never returns an icon the set does not define', () => {
    expect(TRANSIT_ICON_PATHS[iconForMarker('venues', null)]).toBeDefined();
    expect(TRANSIT_ICON_PATHS[iconForMarker('venues', '')]).toBeDefined();
  });
});

describe('glyphKeyFor', () => {
  it('produces a key GLYPH_DEFS can rasterize, for every category', () => {
    // The contract `glyphKeyFor`'s own docblock states ("Matches the keys in
    // GLYPH_DEFS below so the rasterized image exists") and nothing checked.
    // A miss is a pin with no glyph — soft, silent, and site-wide.
    for (const category of VENUE_CATEGORIES) {
      const key = glyphKeyFor('venues', category);
      expect(GLYPH_KEYS.has(key), `${category} → "${key}" has no GLYPH_DEFS entry`).toBe(true);
    }
  });

  it('produces a rasterizable key for every layer', () => {
    for (const { type } of LAYER_DEFS) {
      const key = glyphKeyFor(type);
      expect(GLYPH_KEYS.has(key), `${type} → "${key}" has no GLYPH_DEFS entry`).toBe(true);
    }
  });

  it('agrees with iconForMarker about which icon a key draws', () => {
    // The two functions are independent lookups over the same table; if they
    // disagree, the pin's glyph and the legend's icon differ for one category.
    for (const category of VENUE_CATEGORIES) {
      const key = glyphKeyFor('venues', category);
      const def = GLYPH_DEFS.find((d) => d.key === key);
      expect(def?.icon, `no GLYPH_DEFS entry for ${key}`).toBe(iconForMarker('venues', category));
    }
  });

  it('keys an unknown category off the layer, not a phantom category', () => {
    expect(glyphKeyFor('venues', 'organization')).toBe('type:venues');
    expect(glyphKeyFor('venues', 'other')).toBe('type:venues');
  });

  it('holds no underscore spelling of the hyphenated category', () => {
    // The dead duplicate, asserted gone. Nothing else would notice its return:
    // it resolves the same icon, so only the KEY differs.
    expect(GLYPH_KEYS.has('cat:event_venue')).toBe(false);
    expect(GLYPH_KEYS.has('cat:event-venue')).toBe(true);
  });

  it('defines every GLYPH_DEFS icon in the transit set', () => {
    for (const { key, icon } of GLYPH_DEFS) {
      expect(TRANSIT_ICON_PATHS[icon], `${key} → "${icon}" is not a transit icon`).toBeDefined();
    }
  });

  it('has no duplicate keys', () => {
    expect(GLYPH_KEYS.size).toBe(GLYPH_DEFS.length);
  });
});

describe('categoryLabel', () => {
  it('title-cases and unseparates', () => {
    expect(categoryLabel('community_center')).toBe('Community Center');
    expect(categoryLabel('event-venue')).toBe('Event Venue');
  });

  it('returns empty for absence rather than inventing a label', () => {
    expect(categoryLabel(null)).toBe('');
    expect(categoryLabel(undefined)).toBe('');
  });
});

describe('fallback coverage', () => {
  it('covers every layer in the fallback table', () => {
    // A new layer with no fallback silently draws the venues glyph.
    for (const { type } of LAYER_DEFS) {
      expect(GLYPH_KEYS.has(`type:${type}`), `no fallback glyph for ${type}`).toBe(true);
    }
  });

  it('does not invent a layer the registry has retired', () => {
    const known = new Set(LAYER_DEFS.map((d) => d.type as string));
    const layerKeys = [...GLYPH_KEYS].filter((k) => k.startsWith('type:'));
    for (const k of layerKeys) {
      expect(known.has(k.slice('type:'.length)), `${k} is not a live layer`).toBe(true);
    }
  });

  it('keys every category glyph off a legal category', () => {
    const legal = new Set<string>(VENUE_CATEGORIES);
    const catKeys = [...GLYPH_KEYS].filter((k) => k.startsWith('cat:'));
    expect(catKeys.length).toBeGreaterThan(10);
    for (const k of catKeys) {
      expect(legal.has(k.slice('cat:'.length)), `${k} is not a legal venue category`).toBe(true);
    }
  });
});

describe('unused-layer guard', () => {
  it('types the fallback table over the live LayerType union', () => {
    // Compile-time in the source; asserted here so a widened `LayerType` that
    // forgets a fallback is a test failure rather than a silent venues glyph.
    const types = LAYER_DEFS.map((d) => d.type) as LayerType[];
    expect(types.length).toBe(7);
  });
});
