import { describe, it, expect } from 'vitest';
import { pickBookableTrip } from '../useTripBookingContext';
import type { TripListItem } from '../useTrips';

const TODAY = '2026-08-07';

function trip(over: Partial<TripListItem> = {}): TripListItem {
  return {
    id: 't1',
    title: 'Berlin trip',
    primary_city_id: 'berlin',
    primary_city_name: 'Berlin',
    start_date: '2026-08-12',
    end_date: '2026-08-16',
    status: 'planning',
    member_count: 1,
    place_count: 3,
    day_count: 2,
    min_equality_score: null,
    ...over,
  } as unknown as TripListItem;
}

describe('pickBookableTrip', () => {
  it('prefers the active trip over the primary meaningful trip', () => {
    const active = trip({ id: 'active' });
    const primary = trip({ id: 'primary' });
    expect(pickBookableTrip(active, primary, TODAY)?.id).toBe('active');
  });

  it('falls back to the primary meaningful trip', () => {
    const primary = trip({ id: 'primary' });
    expect(pickBookableTrip(null, primary, TODAY)?.id).toBe('primary');
  });

  it('returns null when there is no trip', () => {
    expect(pickBookableTrip(null, null, TODAY)).toBeNull();
  });

  it('never seeds from a finished trip', () => {
    const past = trip({ start_date: '2026-07-01', end_date: '2026-07-05' });
    expect(pickBookableTrip(past, null, TODAY)).toBeNull();
  });

  it('keeps a trip with no end date (open-ended planning)', () => {
    const openEnded = trip({ start_date: null, end_date: null } as Partial<TripListItem>);
    expect(pickBookableTrip(openEnded, null, TODAY)).not.toBeNull();
  });
});
