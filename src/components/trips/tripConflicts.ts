import type { TripDay, TripPlace } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useTripReservations';

export type ConflictKind = 'time_overlap' | 'double_lodging' | 'overlapping_reservations';
export type ConflictSeverity = 'warning' | 'info';

export interface TripConflict {
  kind: ConflictKind;
  severity: ConflictSeverity;
  /** null for trip-level conflicts (overlapping reservations). */
  dayId: string | null;
  date: string | null;
  dayIndex: number | null;
  placeIds: string[];
  message: string;
}

const LODGING_RESERVATION_TYPES = new Set(['lodging', 'hotel', 'accommodation', 'apartment']);
/** Assumed duration when a timed place has neither end_time nor duration. */
const DEFAULT_DURATION_MIN = 60;

function isLodging(place: TripPlace): boolean {
  if (place.hotel_id) return true;
  return place.category === 'lodging' || place.category === 'hotel';
}

function placeName(place: TripPlace): string {
  return (
    place.venues?.name ||
    place.events?.title ||
    place.hotels?.name ||
    place.custom_name ||
    'Untitled place'
  );
}

function parseMinutes(time: string): number | null {
  const h = parseInt(time.slice(0, 2), 10);
  const m = parseInt(time.slice(3, 5), 10);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

interface Interval {
  place: TripPlace;
  start: number;
  end: number;
  /** True when the end is known (end_time or duration), not assumed. */
  exact: boolean;
}

function intervalFor(place: TripPlace): Interval | null {
  if (!place.start_time) return null;
  const start = parseMinutes(place.start_time);
  if (start == null) return null;
  const explicitEnd = place.end_time ? parseMinutes(place.end_time) : null;
  if (explicitEnd != null && explicitEnd > start) {
    return { place, start, end: explicitEnd, exact: true };
  }
  if (place.duration_minutes && place.duration_minutes > 0) {
    return { place, start, end: start + place.duration_minutes, exact: true };
  }
  return { place, start, end: start + DEFAULT_DURATION_MIN, exact: false };
}

/**
 * Detects scheduling conflicts in a trip. Complements `detectTripGaps`
 * (missing things) with the inverse: too much in the same slot.
 * Pure — safe to call in render memos and unit tests.
 */
export function detectTripConflicts(
  days: TripDay[],
  places: TripPlace[],
  reservations: Reservation[] = [],
): TripConflict[] {
  const conflicts: TripConflict[] = [];
  const sortedDays = [...days].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  sortedDays.forEach((day, idx) => {
    const dayPlaces = places.filter((p) => p.day_id === day.id && p.category !== 'note');

    // Time overlaps: pairwise interval intersection for timed places.
    const intervals = dayPlaces
      .filter((p) => !isLodging(p))
      .map(intervalFor)
      .filter((iv): iv is Interval => iv != null)
      .sort((a, b) => a.start - b.start);
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length; j++) {
        const a = intervals[i];
        const b = intervals[j];
        if (b.start >= a.end) break;
        conflicts.push({
          kind: 'time_overlap',
          severity: a.exact && b.exact ? 'warning' : 'info',
          dayId: day.id,
          date: day.date,
          dayIndex: idx + 1,
          placeIds: [a.place.id, b.place.id],
          message: `Day ${idx + 1}: "${placeName(a.place)}" overlaps "${placeName(b.place)}"`,
        });
      }
    }

    // Two accommodations booked on the same night.
    const lodgings = dayPlaces.filter(isLodging);
    if (lodgings.length > 1) {
      conflicts.push({
        kind: 'double_lodging',
        severity: 'info',
        dayId: day.id,
        date: day.date,
        dayIndex: idx + 1,
        placeIds: lodgings.map((p) => p.id),
        message: `Day ${idx + 1}: ${lodgings.length} accommodations on the same night`,
      });
    }
  });

  // Overlapping lodging reservations (double-booked nights).
  const lodgingRes = reservations
    .filter(
      (r) =>
        LODGING_RESERVATION_TYPES.has(r.type?.toLowerCase() ?? '') &&
        r.check_in &&
        r.check_out &&
        r.status !== 'cancelled',
    )
    .sort((a, b) => a.check_in!.localeCompare(b.check_in!));
  for (let i = 0; i < lodgingRes.length; i++) {
    for (let j = i + 1; j < lodgingRes.length; j++) {
      const a = lodgingRes[i];
      const b = lodgingRes[j];
      if (b.check_in! >= a.check_out!) break;
      conflicts.push({
        kind: 'overlapping_reservations',
        severity: 'warning',
        dayId: null,
        date: b.check_in,
        dayIndex: null,
        placeIds: [],
        message: `"${a.title}" and "${b.title}" overlap (double-booked nights)`,
      });
    }
  }

  return conflicts;
}
