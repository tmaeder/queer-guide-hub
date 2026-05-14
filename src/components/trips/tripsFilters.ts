import type { TripListItem } from '@/hooks/useTrips';
import type { TripSortKey, TripStatusFilter } from './TripsToolbar';

/**
 * Filter + sort a list of trips by the dashboard toolbar state.
 * Pure — no hooks, no side effects. Used by TripsPage and covered by tripsFilters.test.ts.
 */
export function filterAndSortTrips(
  trips: TripListItem[],
  search: string,
  statusFilter: TripStatusFilter,
  sortKey: TripSortKey,
  savedIds?: ReadonlySet<string>,
): TripListItem[] {
  const q = search.trim().toLowerCase();
  const filtered = trips.filter((trip) => {
    if (statusFilter === 'saved') {
      if (!savedIds?.has(trip.id)) return false;
    } else if (statusFilter !== 'all' && trip.status !== statusFilter) {
      return false;
    }
    if (!q) return true;
    return (
      trip.title.toLowerCase().includes(q) ||
      (trip.description ?? '').toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sortKey === 'alphabetical') return a.title.localeCompare(b.title);
    if (sortKey === 'start_date') {
      const aDate = a.start_date ?? '9999-12-31';
      const bDate = b.start_date ?? '9999-12-31';
      return aDate.localeCompare(bDate);
    }
    // 'recent' — newest updated_at first
    return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  });
  return sorted;
}

/**
 * Count trips per status for the toolbar's status filter chips.
 */
export function countTripsByStatus(
  trips: TripListItem[],
  savedIds?: ReadonlySet<string>,
): Record<TripStatusFilter, number> {
  const base: Record<TripStatusFilter, number> = {
    all: trips.length,
    planning: 0,
    active: 0,
    completed: 0,
    archived: 0,
    saved: 0,
  };
  for (const trip of trips) {
    base[trip.status] += 1;
    if (savedIds?.has(trip.id)) base.saved += 1;
  }
  return base;
}
