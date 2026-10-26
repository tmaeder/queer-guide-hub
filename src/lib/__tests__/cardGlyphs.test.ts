import { describe, expect, it } from 'vitest';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';
import { VENUE_CATEGORIES } from '@/lib/venueCategories';
import { EVENT_TYPES } from '@/lib/eventTypes';
import {
  EVENT_GLYPH_MAP,
  HOTEL_GLYPH_MAP,
  VENUE_GLYPH_MAP,
  eventGlyph,
  hotelGlyph,
  venueGlyph,
} from '@/lib/cardGlyphs';

describe('card glyphs', () => {
  it('maps every venue category to a real icon', () => {
    for (const c of VENUE_CATEGORIES) {
      expect(VENUE_GLYPH_MAP[c], c).toBeDefined();
      expect(TRANSIT_ICON_PATHS[venueGlyph(c)], c).toBeTruthy();
    }
  });

  it('maps every event type to a real icon', () => {
    for (const t of EVENT_TYPES) {
      expect(EVENT_GLYPH_MAP[t], t).toBeDefined();
      expect(TRANSIT_ICON_PATHS[eventGlyph(t)], t).toBeTruthy();
    }
  });

  it('maps every hotel type to a real icon', () => {
    for (const t of Object.keys(HOTEL_GLYPH_MAP)) {
      expect(TRANSIT_ICON_PATHS[hotelGlyph(t)], t).toBeTruthy();
    }
    expect(hotelGlyph(null)).toBe('housing');
  });

  it('falls back for unknown or missing values', () => {
    expect(venueGlyph(null)).toBe('pin');
    expect(venueGlyph('spaceport')).toBe('pin');
    expect(eventGlyph(undefined)).toBe('events');
    expect(eventGlyph('unknown')).toBe('events');
  });
});
