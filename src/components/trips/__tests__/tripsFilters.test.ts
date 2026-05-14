import { describe, expect, it } from 'vitest';
import type { TripListItem } from '@/hooks/useTrips';
import { countTripsByStatus, filterAndSortTrips } from '../tripsFilters';

function makeTrip(overrides: Partial<TripListItem> = {}): TripListItem {
  return {
    id: overrides.id ?? 'trip-1',
    owner_id: 'user-1',
    title: overrides.title ?? 'Berlin',
    description: overrides.description ?? null,
    cover_image_url: null,
    start_date: overrides.start_date ?? null,
    end_date: overrides.end_date ?? null,
    currency: 'EUR',
    status: overrides.status ?? 'planning',
    is_public: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2025-01-01T00:00:00Z',
    member_count: 1,
    place_count: 0,
    day_count: 0,
    ...overrides,
  };
}

const trips: TripListItem[] = [
  makeTrip({
    id: 'a',
    title: 'Pride Berlin',
    status: 'active',
    start_date: '2026-06-20',
    updated_at: '2026-03-01T00:00:00Z',
  }),
  makeTrip({
    id: 'b',
    title: 'Barcelona Beach Trip',
    description: 'summer fun',
    status: 'planning',
    start_date: '2026-07-15',
    updated_at: '2026-04-01T00:00:00Z',
  }),
  makeTrip({
    id: 'c',
    title: 'Archived NYC',
    status: 'archived',
    start_date: '2024-06-01',
    updated_at: '2024-07-01T00:00:00Z',
  }),
  makeTrip({
    id: 'd',
    title: 'Amsterdam',
    status: 'completed',
    start_date: '2025-05-01',
    updated_at: '2025-06-01T00:00:00Z',
  }),
];

describe('countTripsByStatus', () => {
  it('counts each status bucket and reports total under "all"', () => {
    expect(countTripsByStatus(trips)).toEqual({
      all: 4,
      planning: 1,
      active: 1,
      completed: 1,
      archived: 1,
      saved: 0,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(countTripsByStatus([])).toEqual({
      all: 0,
      planning: 0,
      active: 0,
      completed: 0,
      archived: 0,
      saved: 0,
    });
  });

  it('counts saved trips when a savedIds set is provided', () => {
    const ids = new Set([trips[0].id, trips[2].id]);
    expect(countTripsByStatus(trips, ids).saved).toBe(2);
  });
});

describe('filterAndSortTrips', () => {
  it('returns everything sorted by recent updated_at when no filter', () => {
    const result = filterAndSortTrips(trips, '', 'all', 'recent');
    expect(result.map((t) => t.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('filters by status filter', () => {
    const result = filterAndSortTrips(trips, '', 'active', 'recent');
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('matches search against title and description (case-insensitive)', () => {
    expect(
      filterAndSortTrips(trips, 'berlin', 'all', 'recent').map((t) => t.id),
    ).toEqual(['a']);
    expect(
      filterAndSortTrips(trips, 'SUMMER', 'all', 'recent').map((t) => t.id),
    ).toEqual(['b']);
  });

  it('combines status and search filters', () => {
    expect(
      filterAndSortTrips(trips, 'beach', 'planning', 'recent').map((t) => t.id),
    ).toEqual(['b']);
    expect(
      filterAndSortTrips(trips, 'beach', 'active', 'recent'),
    ).toEqual([]);
  });

  it('sorts alphabetically by title', () => {
    expect(
      filterAndSortTrips(trips, '', 'all', 'alphabetical').map((t) => t.title),
    ).toEqual(['Amsterdam', 'Archived NYC', 'Barcelona Beach Trip', 'Pride Berlin']);
  });

  it('sorts by start_date ascending, placing undated trips last', () => {
    const withUndated = [
      ...trips,
      makeTrip({ id: 'e', title: 'Undated Trip', start_date: null }),
    ];
    const ids = filterAndSortTrips(withUndated, '', 'all', 'start_date').map(
      (t) => t.id,
    );
    // Order by start_date ascending: c (2024), d (2025), a (2026-06), b (2026-07), then undated e
    expect(ids).toEqual(['c', 'd', 'a', 'b', 'e']);
  });

  it('does not mutate the input array', () => {
    const original = [...trips];
    filterAndSortTrips(trips, '', 'all', 'alphabetical');
    expect(trips).toEqual(original);
  });

  it('handles empty trips list', () => {
    expect(filterAndSortTrips([], 'anything', 'active', 'recent')).toEqual([]);
  });
});
