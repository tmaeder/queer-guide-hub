import { describe, it, expect } from 'vitest';
import {
  parseFilterState,
  serializeFilterState,
  DEFAULT_FILTER_STATE,
  type EventsFilterState,
} from '../eventsQueryString';

describe('eventsQueryString', () => {
  it('serializes empty state to empty params', () => {
    const out = serializeFilterState(DEFAULT_FILTER_STATE);
    expect(out.toString()).toBe('');
  });

  it('round-trips a complex state', () => {
    const state: EventsFilterState = {
      q: 'drag',
      cities: ['Berlin', 'Hamburg'],
      types: ['party', 'meetup'],
      tags: ['lgbtq:trans'],
      accessibility: ['wheelchair'],
      languages: ['en', 'de'],
      ageRestriction: '18',
      organizerId: 'org-123',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      nearMe: true,
      showPast: true,
      isFree: true,
      featured: true,
      sort: 'popularity',
      view: 'timeline',
    };
    const params = serializeFilterState(state);
    const parsed = parseFilterState(params);
    expect(parsed).toEqual(state);
  });

  it('parses legacy city + q params for backwards compat', () => {
    const params = new URLSearchParams('city=Berlin&q=drag');
    const parsed = parseFilterState(params);
    expect(parsed.cities).toEqual(['Berlin']);
    expect(parsed.q).toBe('drag');
  });

  it('defaults sort to date-asc when missing or invalid', () => {
    expect(parseFilterState(new URLSearchParams('')).sort).toBe('date-asc');
    expect(parseFilterState(new URLSearchParams('sort=bogus')).sort).toBe('date-asc');
    expect(parseFilterState(new URLSearchParams('sort=popularity')).sort).toBe('popularity');
  });

  it('defaults view to grid when invalid', () => {
    expect(parseFilterState(new URLSearchParams('view=bogus')).view).toBe('grid');
    expect(parseFilterState(new URLSearchParams('view=timeline')).view).toBe('timeline');
  });

  it('omits default values from serialization', () => {
    const params = serializeFilterState({ ...DEFAULT_FILTER_STATE, sort: 'date-asc', view: 'grid' });
    expect(params.has('sort')).toBe(false);
    expect(params.has('view')).toBe(false);
  });

  it('uses short keys (cities, types, acc, lang)', () => {
    const state: EventsFilterState = {
      ...DEFAULT_FILTER_STATE,
      cities: ['X'],
      types: ['Y'],
      accessibility: ['Z'],
      languages: ['en'],
    };
    const params = serializeFilterState(state);
    expect(params.get('cities')).toBe('X');
    expect(params.get('types')).toBe('Y');
    expect(params.get('acc')).toBe('Z');
    expect(params.get('lang')).toBe('en');
  });
});
