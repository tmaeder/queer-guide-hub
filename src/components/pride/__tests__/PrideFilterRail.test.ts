import { describe, it, expect } from 'vitest';
import { applyPrideFilters, continentOf } from '../PrideFilterRail';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

const mk = (overrides: Partial<PrideCalendarEvent> = {}): PrideCalendarEvent => ({
  id: crypto.randomUUID(),
  slug: 'slug',
  title: 'Some Pride',
  start_date: '2026-06-15T00:00:00.000Z',
  end_date: null,
  city: 'Berlin',
  city_id: null,
  country: 'DE',
  country_id: null,
  latitude: 0,
  longitude: 0,
  images: null,
  is_featured: false,
  verification_status: 'unverified',
  description: null,
  ...overrides,
});

const EMPTY = { months: [], continents: [], countries: [], featuredOnly: false, query: '' };

describe('continentOf', () => {
  it('maps ISO2 to continent', () => {
    expect(continentOf('DE')).toBe('Europe');
    expect(continentOf('US')).toBe('Americas');
    expect(continentOf('AU')).toBe('Oceania');
    expect(continentOf('TH')).toBe('Asia');
    expect(continentOf('ZA')).toBe('Africa');
  });

  it('returns "Other" for unknown or null', () => {
    expect(continentOf(null)).toBe('Other');
    expect(continentOf(undefined)).toBe('Other');
    expect(continentOf('XX')).toBe('Other');
  });

  it('is case-insensitive', () => {
    expect(continentOf('de')).toBe('Europe');
  });
});

describe('applyPrideFilters', () => {
  const events = [
    mk({ title: 'Berlin Pride', country: 'DE', start_date: '2026-07-25T00:00:00Z', is_featured: true, city: 'Berlin' }),
    mk({ title: 'NYC Pride', country: 'US', start_date: '2026-06-28T00:00:00Z', is_featured: true, city: 'New York' }),
    mk({ title: 'Taipei Pride', country: 'TW', start_date: '2026-10-31T00:00:00Z', is_featured: true, city: 'Taipei' }),
    mk({ title: 'Sofia Pride', country: 'BG', start_date: '2026-06-13T00:00:00Z', is_featured: false, city: 'Sofia' }),
  ];

  it('returns all when filters empty', () => {
    expect(applyPrideFilters(events, EMPTY)).toHaveLength(4);
  });

  it('filters by month', () => {
    const r = applyPrideFilters(events, { ...EMPTY, months: [5] }); // June = 5
    expect(r.map((e) => e.title)).toEqual(['NYC Pride', 'Sofia Pride']);
  });

  it('filters by continent', () => {
    const r = applyPrideFilters(events, { ...EMPTY, continents: ['Europe'] });
    expect(r.map((e) => e.title).sort()).toEqual(['Berlin Pride', 'Sofia Pride']);
  });

  it('filters by country ISO2', () => {
    const r = applyPrideFilters(events, { ...EMPTY, countries: ['US', 'TW'] });
    expect(r.map((e) => e.title).sort()).toEqual(['NYC Pride', 'Taipei Pride']);
  });

  it('filters by featuredOnly', () => {
    const r = applyPrideFilters(events, { ...EMPTY, featuredOnly: true });
    expect(r).toHaveLength(3);
    expect(r.every((e) => e.is_featured)).toBe(true);
  });

  it('searches title / city / country', () => {
    expect(applyPrideFilters(events, { ...EMPTY, query: 'berlin' })).toHaveLength(1);
    expect(applyPrideFilters(events, { ...EMPTY, query: 'taipei' })).toHaveLength(1);
    expect(applyPrideFilters(events, { ...EMPTY, query: 'tw' })).toHaveLength(1); // matches country
  });

  it('combines filters with AND semantics', () => {
    const r = applyPrideFilters(events, {
      ...EMPTY,
      continents: ['Europe'],
      months: [6], // July
      featuredOnly: true,
    });
    expect(r.map((e) => e.title)).toEqual(['Berlin Pride']);
  });

  it('returns empty when no events match', () => {
    expect(applyPrideFilters(events, { ...EMPTY, countries: ['JP'] })).toEqual([]);
  });
});
