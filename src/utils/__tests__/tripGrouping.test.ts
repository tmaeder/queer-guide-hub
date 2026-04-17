import { describe, it, expect } from 'vitest';
import { suggestTripGroupings } from '@/utils/tripGrouping';
import type { Reservation } from '@/hooks/useReservations';

const make = (overrides: Partial<Reservation>): Reservation => ({
  key: overrides.key ?? `booking:${Math.random()}`,
  id: overrides.id ?? 'x',
  origin: 'booking',
  source: 'provider_api',
  user_id: 'u',
  trip_id: null,
  type: 'hotel',
  title: 'res',
  status: 'confirmed',
  start_at: null,
  end_at: null,
  provider: 'Booking.com',
  provider_booking_id: null,
  confirmation_code: null,
  booking_url: null,
  total_amount: null,
  currency: null,
  city_id: null,
  country_id: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('suggestTripGroupings', () => {
  it('returns empty for fewer than two dated reservations', () => {
    expect(suggestTripGroupings([])).toEqual([]);
    expect(
      suggestTripGroupings([make({ start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-02T00:00:00Z' })]),
    ).toEqual([]);
  });

  it('groups overlapping same-city reservations', () => {
    const res = [
      make({ key: 'a', start_at: '2026-05-01T10:00:00Z', end_at: '2026-05-04T12:00:00Z', city_id: 'berlin' }),
      make({ key: 'b', start_at: '2026-05-02T08:00:00Z', end_at: '2026-05-03T22:00:00Z', city_id: 'berlin' }),
      make({ key: 'c', start_at: '2026-05-04T18:00:00Z', end_at: '2026-05-04T20:00:00Z', city_id: 'berlin' }),
    ];
    const out = suggestTripGroupings(res);
    expect(out).toHaveLength(1);
    expect(out[0].reservations).toHaveLength(3);
    expect(out[0].city_id).toBe('berlin');
  });

  it('groups across small gap when within maxGapDays', () => {
    const res = [
      make({ key: 'a', start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-03T00:00:00Z', city_id: 'paris' }),
      make({ key: 'b', start_at: '2026-05-04T00:00:00Z', end_at: '2026-05-05T00:00:00Z', city_id: 'paris' }),
    ];
    expect(suggestTripGroupings(res, { maxGapDays: 1 })).toHaveLength(1);
    expect(suggestTripGroupings(res, { maxGapDays: 0 })).toHaveLength(0);
  });

  it('does not merge different cities even when dates overlap', () => {
    const res = [
      make({ key: 'a', start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-04T00:00:00Z', city_id: 'berlin' }),
      make({ key: 'b', start_at: '2026-05-02T00:00:00Z', end_at: '2026-05-03T00:00:00Z', city_id: 'paris' }),
    ];
    expect(suggestTripGroupings(res)).toHaveLength(0);
  });

  it('treats unknown locations as compatible', () => {
    const res = [
      make({ key: 'a', start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-04T00:00:00Z' }),
      make({ key: 'b', start_at: '2026-05-02T00:00:00Z', end_at: '2026-05-03T00:00:00Z' }),
    ];
    expect(suggestTripGroupings(res)).toHaveLength(1);
  });

  it('sums totals only when currencies match', () => {
    const res = [
      make({ key: 'a', start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-04T00:00:00Z', total_amount: 100, currency: 'EUR' }),
      make({ key: 'b', start_at: '2026-05-02T00:00:00Z', end_at: '2026-05-03T00:00:00Z', total_amount: 50, currency: 'EUR' }),
    ];
    expect(suggestTripGroupings(res)[0].total_amount).toBe(150);
    expect(suggestTripGroupings(res)[0].currency).toBe('EUR');

    const mixed = [
      make({ key: 'a', start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-04T00:00:00Z', total_amount: 100, currency: 'EUR' }),
      make({ key: 'b', start_at: '2026-05-02T00:00:00Z', end_at: '2026-05-03T00:00:00Z', total_amount: 50, currency: 'USD' }),
    ];
    expect(suggestTripGroupings(mixed)[0].total_amount).toBeNull();
    expect(suggestTripGroupings(mixed)[0].currency).toBeNull();
  });

  it('produces a stable id from member keys regardless of input order', () => {
    const a = make({ key: 'a', start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-02T00:00:00Z' });
    const b = make({ key: 'b', start_at: '2026-05-02T00:00:00Z', end_at: '2026-05-03T00:00:00Z' });
    expect(suggestTripGroupings([a, b])[0].id).toBe(suggestTripGroupings([b, a])[0].id);
  });
});
