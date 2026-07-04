import { describe, it, expect } from 'vitest';
import {
  buildLegs,
  suggestMode,
  legDurationMin,
  totalWalkingKm,
  formatLegDistance,
  formatLegDuration,
} from '../tripLegs';
import type { TripPlace } from '@/hooks/useTrips';

function place(overrides: Partial<TripPlace>): TripPlace {
  return {
    id: 'p',
    trip_id: 't',
    day_id: 'd1',
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

// Berlin coordinates roughly 1.2 km apart (straight line).
const A = place({ id: 'a', latitude: 52.52, longitude: 13.405 });
const B = place({ id: 'b', latitude: 52.53, longitude: 13.41 });
// ~8 km away.
const C = place({ id: 'c', latitude: 52.59, longitude: 13.45 });

describe('suggestMode', () => {
  it('walks short hops', () => expect(suggestMode(1.5)).toBe('walk'));
  it('transits city distances', () => expect(suggestMode(8)).toBe('transit'));
  it('drives long hauls', () => expect(suggestMode(50)).toBe('drive'));
});

describe('legDurationMin', () => {
  it('walking 4.5 km/h', () => expect(legDurationMin(1.5, 'walk')).toBe(20));
  it('never returns 0', () => expect(legDurationMin(0.01, 'drive')).toBe(1));
  it('long drives use faster speed', () => {
    expect(legDurationMin(70, 'drive')).toBe(60);
  });
});

describe('buildLegs', () => {
  it('returns empty for <2 locatable places', () => {
    expect(buildLegs([A])).toEqual([]);
    expect(buildLegs([A, place({ id: 'x' })])).toEqual([]);
  });

  it('builds a leg between consecutive locatable places', () => {
    const legs = buildLegs([A, B]);
    expect(legs).toHaveLength(1);
    expect(legs[0].fromId).toBe('a');
    expect(legs[0].toId).toBe('b');
    expect(legs[0].distanceKm).toBeGreaterThan(1);
    expect(legs[0].distanceKm).toBeLessThan(2.5);
    expect(legs[0].mode).toBe('walk');
    expect(legs[0].modeOverridden).toBe(false);
  });

  it('skips places without coords and notes, connecting neighbors', () => {
    const note = place({ id: 'n', category: 'note', latitude: 52.525, longitude: 13.407 });
    const noCoords = place({ id: 'x' });
    const legs = buildLegs([A, note, noCoords, B]);
    expect(legs).toHaveLength(1);
    expect(legs[0].fromId).toBe('a');
    expect(legs[0].toId).toBe('b');
  });

  it('respects arrive_mode override on destination', () => {
    const legs = buildLegs([A, { ...B, arrive_mode: 'drive' }]);
    expect(legs[0].mode).toBe('drive');
    expect(legs[0].modeOverridden).toBe(true);
  });

  it('drops sub-100m legs', () => {
    const nearby = place({ id: 'z', latitude: 52.5201, longitude: 13.4051 });
    expect(buildLegs([A, nearby])).toEqual([]);
  });
});

describe('totalWalkingKm', () => {
  it('sums only walk legs', () => {
    const legs = buildLegs([A, B, C]);
    const walkSum = totalWalkingKm(legs);
    expect(walkSum).toBeGreaterThan(0);
    expect(walkSum).toBeLessThan(legs.reduce((s, l) => s + l.distanceKm, 0));
  });
});

describe('formatting', () => {
  it('formats sub-km as meters', () => expect(formatLegDistance(0.42)).toBe('~420 m'));
  it('formats km with one decimal under 10', () => expect(formatLegDistance(1.234)).toBe('~1.2 km'));
  it('rounds km above 10', () => expect(formatLegDistance(23.4)).toBe('~23 km'));
  it('formats minutes', () => expect(formatLegDuration(45)).toBe('~45 min'));
  it('formats hours', () => expect(formatLegDuration(120)).toBe('~2 h'));
  it('formats mixed', () => expect(formatLegDuration(80)).toBe('~1 h 20 min'));
});
