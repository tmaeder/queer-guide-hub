import type { TripDay, TripPlace } from '@/hooks/useTrips';

export type GapSeverity = 'warning' | 'info';
export type GapKind = 'no_lodging' | 'no_dinner' | 'empty_day' | 'unconfirmed_booking';

export interface TripGap {
  kind: GapKind;
  severity: GapSeverity;
  dayId: string;
  date: string;
  dayIndex: number;
  message: string;
}

function isLodging(place: TripPlace): boolean {
  if (place.hotel_id) return true;
  if (place.category === 'lodging' || place.category === 'hotel') return true;
  return false;
}

function isBooked(place: TripPlace): boolean {
  return place.booking_status === 'booked' || place.booking_status === 'completed';
}

function hasEveningPlace(places: TripPlace[]): boolean {
  return places.some((p) => {
    if (!p.start_time) return false;
    const hour = parseInt(p.start_time.slice(0, 2), 10);
    return hour >= 18 && hour <= 22;
  });
}

export function detectTripGaps(
  days: TripDay[],
  places: TripPlace[],
): TripGap[] {
  if (!days.length) return [];
  const sortedDays = [...days].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );
  const gaps: TripGap[] = [];

  sortedDays.forEach((day, idx) => {
    const dayPlaces = places.filter((p) => p.day_id === day.id);

    if (dayPlaces.length === 0) {
      gaps.push({
        kind: 'empty_day',
        severity: 'info',
        dayId: day.id,
        date: day.date,
        dayIndex: idx + 1,
        message: `Day ${idx + 1}: nothing planned yet`,
      });
      return;
    }

    const lodgings = dayPlaces.filter(isLodging);
    const lodging = lodgings.length > 0;
    const isLastDay = idx === sortedDays.length - 1;
    if (!lodging && !isLastDay) {
      gaps.push({
        kind: 'no_lodging',
        severity: 'warning',
        dayId: day.id,
        date: day.date,
        dayIndex: idx + 1,
        message: `Day ${idx + 1}: no accommodation`,
      });
    } else if (lodging && !lodgings.some(isBooked) && !isLastDay) {
      gaps.push({
        kind: 'unconfirmed_booking',
        severity: 'info',
        dayId: day.id,
        date: day.date,
        dayIndex: idx + 1,
        message: `Day ${idx + 1}: tentative reservation`,
      });
    }

    if (!hasEveningPlace(dayPlaces)) {
      gaps.push({
        kind: 'no_dinner',
        severity: 'info',
        dayId: day.id,
        date: day.date,
        dayIndex: idx + 1,
        message: `Day ${idx + 1}: no evening plans`,
      });
    }
  });

  return gaps;
}
