import { describe, expect, it } from 'vitest';
import type { TripWithDetails } from '@/hooks/useTrips';
import { computeTripProgress } from '../tripProgress';

function makeTrip(overrides: Partial<TripWithDetails> = {}): TripWithDetails {
  return {
    id: 'trip-1',
    owner_id: 'user-1',
    title: 'Test',
    description: null,
    cover_image_url: null,
    start_date: null,
    end_date: null,
    currency: 'EUR',
    status: 'planning',
    is_public: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    trip_members: [],
    trip_days: [],
    trip_places: [],
    ...overrides,
  };
}

describe('computeTripProgress', () => {
  it('empty trip scores 0%', () => {
    expect(computeTripProgress(makeTrip()).percent).toBe(0);
  });

  it('trip with dates only scores 25%', () => {
    const trip = makeTrip({
      start_date: '2026-05-01',
      end_date: '2026-05-07',
    });
    expect(computeTripProgress(trip).percent).toBe(25);
    expect(computeTripProgress(trip).steps.find((s) => s.key === 'dates')?.done).toBe(
      true,
    );
  });

  it('trip with places and days scores 50%', () => {
    const trip = makeTrip({
      trip_places: [{ id: 'p1' } as unknown as TripWithDetails['trip_places'][number]],
      trip_days: [{ id: 'd1' } as unknown as TripWithDetails['trip_days'][number]],
    });
    expect(computeTripProgress(trip).percent).toBe(50);
  });

  it('fully planned solo trip (no companions) scores 75%', () => {
    const trip = makeTrip({
      start_date: '2026-05-01',
      end_date: '2026-05-07',
      trip_places: [{ id: 'p1' } as unknown as TripWithDetails['trip_places'][number]],
      trip_days: [{ id: 'd1' } as unknown as TripWithDetails['trip_days'][number]],
      trip_members: [
        { id: 'm1' } as unknown as TripWithDetails['trip_members'][number],
      ],
    });
    expect(computeTripProgress(trip).percent).toBe(75);
  });

  it('fully planned group trip scores 100%', () => {
    const trip = makeTrip({
      start_date: '2026-05-01',
      end_date: '2026-05-07',
      trip_places: [{ id: 'p1' } as unknown as TripWithDetails['trip_places'][number]],
      trip_days: [{ id: 'd1' } as unknown as TripWithDetails['trip_days'][number]],
      trip_members: [
        { id: 'm1' } as unknown as TripWithDetails['trip_members'][number],
        { id: 'm2' } as unknown as TripWithDetails['trip_members'][number],
      ],
    });
    expect(computeTripProgress(trip).percent).toBe(100);
  });

  it('returns the step keys in a stable order', () => {
    expect(
      computeTripProgress(makeTrip()).steps.map((s) => s.key),
    ).toEqual(['dates', 'places', 'days', 'companions']);
  });
});
