import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from '@/lib/eventTypes';
import { VENUE_CATEGORIES } from '@/lib/venueCategories';
import {
  ALL_PLACE_CATEGORIES,
  EVENT_TYPE_GROUPS,
  eventTypesFor,
  parsePlaceView,
} from '@/lib/goingOutFilters';
import { formatEventPrice } from '@/lib/eventPrice';

describe('going-out filters', () => {
  it('event groups only name real event types', () => {
    const known = new Set<string>(EVENT_TYPES);
    for (const g of EVENT_TYPE_GROUPS) for (const t of g.types) expect(known.has(t)).toBe(true);
    expect(eventTypesFor('nope')).toBeUndefined();
    expect(eventTypesFor(null)).toBeUndefined();
  });

  it('place filters only name real venue categories, never cruising/toilet/other', () => {
    const known = new Set<string>(VENUE_CATEGORIES);
    for (const c of ALL_PLACE_CATEGORIES) expect(known.has(c)).toBe(true);
    for (const c of ['cruising', 'toilet', 'other']) expect(ALL_PLACE_CATEGORIES).not.toContain(c);
  });

  it('parses the view param with a grid default', () => {
    expect(parsePlaceView('map')).toBe('map');
    expect(parsePlaceView('bogus')).toBe('grid');
    expect(parsePlaceView(null)).toBe('grid');
  });

  it('formats a price only when one is known', () => {
    expect(formatEventPrice({})).toBeNull();
    expect(formatEventPrice({ is_free: true })).toBe('Free');
    expect(formatEventPrice({ price_min: 10, currency: 'EUR' })).toMatch(/^From .*10/);
  });
});
