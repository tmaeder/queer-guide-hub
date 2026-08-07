import { describe, it, expect } from 'vitest';
import {
  formatEventDateLabel,
  monthMatchesBestTime,
  groupEventsByCity,
  mergeGoNowDestinations,
  type GoNowDestination,
} from '../useGoNowDestinations';
import type { PersonalizedCityRow } from '../usePersonalizedCities';

const AUG = new Date('2026-08-07T12:00:00Z');

function eventRow(over: Record<string, unknown> = {}) {
  return {
    title: 'Antwerp Pride',
    start_date: '2026-08-08',
    end_date: '2026-08-17',
    city: {
      id: 'antwerp',
      name: 'Antwerp',
      slug: 'antwerp',
      image_url: null,
      editorial_hook: null,
    },
    country: { name: 'Belgium', equality_score: 100 },
    ...over,
  } as Parameters<typeof groupEventsByCity>[0][number];
}

function cityRow(id: string, over: Partial<PersonalizedCityRow> = {}): PersonalizedCityRow {
  return {
    id,
    name: id,
    slug: id,
    image_url: null,
    population: 1_000_000,
    editorial_hook: null,
    best_time_to_visit: null,
    countries: { name: 'Testland', equality_score: 80 },
    ...over,
  };
}

describe('formatEventDateLabel', () => {
  it('compacts a same-month range', () => {
    expect(formatEventDateLabel('2026-08-08', '2026-08-17')).toMatch(/^8–17 /);
  });

  it('renders a single day without a range', () => {
    expect(formatEventDateLabel('2026-08-22', null)).not.toContain('–');
    expect(formatEventDateLabel('2026-08-22', '2026-08-22')).not.toContain('–');
  });

  it('spans months with both endpoints', () => {
    const label = formatEventDateLabel('2026-08-28', '2026-09-01');
    expect(label).toContain('–');
  });

  it('returns empty for missing or invalid starts', () => {
    expect(formatEventDateLabel(null, null)).toBe('');
    expect(formatEventDateLabel('nope', null)).toBe('');
  });
});

describe('monthMatchesBestTime', () => {
  it('matches full month names case-insensitively', () => {
    expect(monthMatchesBestTime('Best from June to August', AUG)).toBe(true);
    expect(monthMatchesBestTime('august is peak season', AUG)).toBe(true);
  });

  it('matches the 3-letter abbreviation as a word', () => {
    expect(monthMatchesBestTime('Jun–Aug', AUG)).toBe(true);
  });

  it('rejects other months and null text', () => {
    expect(monthMatchesBestTime('December to February', AUG)).toBe(false);
    expect(monthMatchesBestTime(null, AUG)).toBe(false);
  });
});

describe('groupEventsByCity', () => {
  it('keeps the soonest event per city and skips city-less rows', () => {
    const rows = [
      eventRow(),
      eventRow({ title: 'Later Antwerp Fest', start_date: '2026-09-01' }),
      eventRow({ city: null }),
      eventRow({
        title: 'Turku Pride',
        city: { id: 'turku', name: 'Turku', slug: 'turku', image_url: null, editorial_hook: null },
        country: { name: 'Finland', equality_score: 100 },
      }),
    ];
    const grouped = groupEventsByCity(rows);
    expect(grouped.map((g) => g.cityId)).toEqual(['antwerp', 'turku']);
    expect(grouped[0].reason.kind).toBe('event');
    expect(grouped[0].reason.label).toContain('Antwerp Pride');
  });
});

describe('mergeGoNowDestinations', () => {
  const eventCity: GoNowDestination = {
    cityId: 'antwerp',
    name: 'Antwerp',
    slug: 'antwerp',
    imageUrl: null,
    editorialHook: null,
    countryName: 'Belgium',
    equalityScore: 100,
    reason: { kind: 'event', label: 'Antwerp Pride · 8–17 Aug' },
  };

  it('leads with event cities and fills with trending, deduped', () => {
    const merged = mergeGoNowDestinations(
      [eventCity],
      [cityRow('antwerp'), cityRow('berlin'), cityRow('madrid')],
      3,
      AUG,
    );
    expect(merged.map((m) => m.cityId)).toEqual(['antwerp', 'berlin', 'madrid']);
    expect(merged[1].reason.kind).toBe('trending');
  });

  it('marks a best-time month match as a season reason (badge, never a filter)', () => {
    const merged = mergeGoNowDestinations(
      [],
      [cityRow('lisbon', { best_time_to_visit: 'May to August' }), cityRow('oslo')],
      2,
      AUG,
    );
    expect(merged[0].reason).toEqual({ kind: 'season', label: 'May to August' });
    expect(merged[1].reason.kind).toBe('trending');
  });

  it('respects the limit', () => {
    const merged = mergeGoNowDestinations(
      [eventCity],
      [cityRow('a'), cityRow('b'), cityRow('c')],
      2,
      AUG,
    );
    expect(merged).toHaveLength(2);
  });
});
