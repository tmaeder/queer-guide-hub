import { describe, it, expect } from 'vitest';
import { detectTripGaps } from '../tripGaps';
import type { TripDay, TripPlace } from '@/hooks/useTrips';

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
    ...overrides,
  };
}

describe('detectTripGaps', () => {
  it('returns empty for empty days', () => {
    expect(detectTripGaps([], [])).toEqual([]);
  });

  it('flags day with no places as empty_day', () => {
    const gaps = detectTripGaps([day('d1', '2026-06-01')], []);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe('empty_day');
  });

  it('flags missing lodging on non-last days', () => {
    const days = [day('d1', '2026-06-01'), day('d2', '2026-06-02')];
    const places = [
      place({ id: 'p1', day_id: 'd1', category: 'attraction' }),
      place({ id: 'p2', day_id: 'd2', hotel_id: 'h1' }),
    ];
    const gaps = detectTripGaps(days, places);
    expect(gaps.find((g) => g.kind === 'no_lodging' && g.dayId === 'd1')).toBeTruthy();
    expect(gaps.find((g) => g.kind === 'no_lodging' && g.dayId === 'd2')).toBeFalsy();
  });

  it('does not flag missing lodging on last day', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [place({ id: 'p1', day_id: 'd1', category: 'attraction' })];
    const gaps = detectTripGaps(days, places);
    expect(gaps.find((g) => g.kind === 'no_lodging')).toBeFalsy();
  });

  it('flags no evening plans (no_dinner)', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'p1', day_id: 'd1', start_time: '10:00', hotel_id: 'h1' }),
    ];
    const gaps = detectTripGaps(days, places);
    expect(gaps.find((g) => g.kind === 'no_dinner')).toBeTruthy();
  });

  it('does not flag no_dinner when evening place exists', () => {
    const days = [day('d1', '2026-06-01')];
    const places = [
      place({ id: 'p1', day_id: 'd1', start_time: '19:30', hotel_id: 'h1' }),
    ];
    const gaps = detectTripGaps(days, places);
    expect(gaps.find((g) => g.kind === 'no_dinner')).toBeFalsy();
  });

  it('recognizes lodging via category', () => {
    const days = [day('d1', '2026-06-01'), day('d2', '2026-06-02')];
    const places = [place({ id: 'p1', day_id: 'd1', category: 'lodging' })];
    const gaps = detectTripGaps(days, places);
    expect(gaps.find((g) => g.kind === 'no_lodging' && g.dayId === 'd1')).toBeFalsy();
  });
});
