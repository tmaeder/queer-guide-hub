import type { TripListItem } from '@/hooks/useTrips';
import type { TripSortKey, TripStatusFilter } from './TripsToolbar';

const DEFAULT_TITLE_KEY = 'trips.dialog.create.defaultTitle';

/**
 * A trip is "meaningful" when the user has invested something in it:
 * either a place, dates, or a custom title. Empty stubs (no places, no dates,
 * fallback "Trip to X" title) are treated as drafts and hidden from prominent
 * surfaces like the /travel hero.
 */
export function isMeaningfulTrip(
  trip: Pick<TripListItem, 'title' | 'place_count' | 'start_date' | 'end_date' | 'primary_city_name'>,
): boolean {
  if (trip.place_count > 0) return true;
  if (trip.start_date || trip.end_date) return true;
  const raw = trip.title?.trim();
  if (!raw) return false;
  if (raw === DEFAULT_TITLE_KEY) return false;
  const city = trip.primary_city_name?.trim();
  if (city && raw === `${city} trip`) return false;
  if (city && raw === `Trip to ${city}`) return false;
  return true;
}

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
