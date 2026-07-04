import { describe, it, expect } from 'vitest';
import { detectTripConflicts } from '../tripConflicts';
import type { TripDay, TripPlace } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useTripReservations';

function day(id: string, date: string, sort = 0): TripDay {
  return { id, trip_id: 't', date, title: null, notes: null, sort_order: sort };
}

function place(overrides: Partial<TripPlace>): TripPlace {
  return {
    id: 'p',
    trip_id: 't',
    day_id: null,
    venue_id: null,
    event_id: null,
    hotel_id: null,
    custom_name: null,
    custom_address: null,
    latitude: null,
    longitude: null,
    city_id: null,
    country_id: null,
    start_time: null,
    end_time: null,
    duration_minutes: null,
    notes: null,
    category: null,
    sort_order: 0,
    created_by: null,
    created_at: '',
    booking_status: 'booked',
    reservation_id: null,
    ...overrides,
  };
}

function reservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'r',
    trip_id: 't',
    place_id: null,
    type: 'hotel',
    title: 'Hotel',
    confirmation_code: null,
    check_in: null,
    check_out: null,
    provider: null,
    booking_url: null,
    amount: null,
    currency: null,
    notes: null,
    status: 'confirmed',
    attachment_urls: null,
    created_at: '',
    ...overrides,
  };
}

describe('detectTripConflicts', () => {
  it('returns empty for empty input', () => {
    expect(detectTripConflicts([], [])).toEqual([]);
  });

  it('flags overlapping timed places with explicit ends as warning', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'a', day_id: 'd1', custom_name: 'Museum', start_time: '10:00', end_time: '12:00' }),
      place({ id: 'b', day_id: 'd1', custom_name: 'Brunch', start_time: '11:00', end_time: '13:00' }),
    ];
    const conflicts = detectTripConflicts(days, places);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('time_overlap');
    expect(conflicts[0].severity).toBe('warning');
    expect(conflicts[0].placeIds).toEqual(['a', 'b']);
  });

  it('uses duration_minutes when end_time missing', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'a', day_id: 'd1', start_time: '10:00', duration_minutes: 180 }),
      place({ id: 'b', day_id: 'd1', start_time: '12:00', end_time: '13:00' }),
    ];
    const conflicts = detectTripConflicts(days, places);
    expect(conflicts.find((c) => c.kind === 'time_overlap')?.severity).toBe('warning');
  });

  it('assumed-duration overlaps are info, not warning', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'a', day_id: 'd1', start_time: '10:00' }),
      place({ id: 'b', day_id: 'd1', start_time: '10:30' }),
    ];
    const conflicts = detectTripConflicts(days, places);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('info');
  });

  it('does not flag back-to-back places', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'a', day_id: 'd1', start_time: '10:00', end_time: '11:00' }),
      place({ id: 'b', day_id: 'd1', start_time: '11:00', end_time: '12:00' }),
    ];
    expect(detectTripConflicts(days, places)).toEqual([]);
  });

  it('ignores notes and lodging in time overlaps', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'a', day_id: 'd1', start_time: '10:00', end_time: '12:00' }),
      place({ id: 'n', day_id: 'd1', category: 'note', start_time: '10:30' }),
      place({ id: 'h', day_id: 'd1', hotel_id: 'h1', start_time: '10:00', end_time: '12:00' }),
    ];
    expect(detectTripConflicts(days, places)).toEqual([]);
  });

  it('flags two accommodations on the same night', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'h1', day_id: 'd1', hotel_id: 'x' }),
      place({ id: 'h2', day_id: 'd1', category: 'lodging' }),
    ];
    const conflicts = detectTripConflicts(days, places);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('double_lodging');
    expect(conflicts[0].placeIds).toEqual(['h1', 'h2']);
  });

  it('flags overlapping lodging reservations', () => {
    const reservations = [
      reservation({ id: 'r1', title: 'Hotel A', check_in: '2026-06-01', check_out: '2026-06-04' }),
      reservation({ id: 'r2', title: 'Hotel B', check_in: '2026-06-03', check_out: '2026-06-06' }),
    ];
    const conflicts = detectTripConflicts([], [], reservations);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('overlapping_reservations');
    expect(conflicts[0].severity).toBe('warning');
  });

  it('checkout day equal to next check-in is not a conflict', () => {
    const reservations = [
      reservation({ id: 'r1', check_in: '2026-06-01', check_out: '2026-06-03' }),
      reservation({ id: 'r2', check_in: '2026-06-03', check_out: '2026-06-06' }),
    ];
    expect(detectTripConflicts([], [], reservations)).toEqual([]);
  });

  it('ignores cancelled and non-lodging reservations', () => {
    const reservations = [
      reservation({ id: 'r1', check_in: '2026-06-01', check_out: '2026-06-04', status: 'cancelled' }),
      reservation({ id: 'r2', check_in: '2026-06-01', check_out: '2026-06-04', type: 'flight' }),
      reservation({ id: 'r3', check_in: '2026-06-01', check_out: '2026-06-04' }),
    ];
    expect(detectTripConflicts([], [], reservations)).toEqual([]);
  });
});
