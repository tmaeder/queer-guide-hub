const mockCalls: Array<[string, ...unknown[]]> = [];
let mockRows: unknown[] = [];

function mockBuilder(): Record<string, (...args: unknown[]) => unknown> {
  const b: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['from', 'select', 'neq', 'is', 'gte', 'lte', 'eq', 'or', 'order', 'limit']) {
    b[m] = (...args: unknown[]) => {
      mockCalls.push([m, ...args]);
      return b;
    };
  }
  b.then = (resolve: unknown) => (resolve as (v: unknown) => void)({ data: mockRows, error: null });
  b.maybeSingle = async () => ({ data: null, error: null });
  return b;
}
jest.mock('@/lib/supabase', () => ({ supabase: mockBuilder() }));

import { eventsToGeoJSON } from '@/map/eventsGeoJSON';
import {
  fetchEventBySlug,
  fetchEventsInBounds,
  formatEventWhen,
  isOngoing,
  priceLabel,
  rankUpcoming,
  type EventListItem,
} from '../events';

beforeEach(() => {
  mockCalls.length = 0;
  mockRows = [];
});

const ev = (over: Partial<EventListItem>): EventListItem => ({
  id: 'e',
  slug: 'e',
  title: 'E',
  start_date: '2026-11-07T21:00:00Z',
  end_date: null,
  timezone: 'Europe/Zurich',
  latitude: 47.37,
  longitude: 8.54,
  city: 'Zurich',
  event_type: 'party',
  venue_name: null,
  ...over,
});

describe('upcoming events query', () => {
  it('uses the web feed predicate: active, not merged, next of a series, ends now or later', async () => {
    await fetchEventsInBounds([8.4, 47.3, 8.6, 47.4], new Date('2026-11-01T12:00:00Z'));
    expect(mockCalls).toEqual(
      expect.arrayContaining([
        ['eq', 'status', 'active'],
        ['is', 'duplicate_of_id', null],
        ['eq', 'series_next', true],
        ['is', 'parent_event_id', null],
        ['or', 'end_date.gte.2026-11-01T12:00:00.000Z,and(end_date.is.null,start_date.gte.2026-11-01T12:00:00.000Z)'],
        ['gte', 'latitude', 47.3],
        ['lte', 'longitude', 8.6],
      ]),
    );
  });

  it('detail hides cancelled and merged events but keeps past ones and NULL status', async () => {
    await fetchEventBySlug('pride-zurich');
    expect(mockCalls).toEqual(
      expect.arrayContaining([
        ['eq', 'slug', 'pride-zurich'],
        ['is', 'duplicate_of_id', null],
        ['or', 'status.is.null,status.neq.cancelled'],
      ]),
    );
    expect(mockCalls.some(([m, col]) => m === 'or' && String(col).includes('start_date'))).toBe(false);
  });
});

describe('formatEventWhen', () => {
  it('shows a midnight start in the event zone as a date only, never as midnight', () => {
    expect(formatEventWhen(ev({ start_date: '2026-11-06T23:00:00Z' }), 'en-GB')).toBe('Sat 7 Nov');
  });

  it('shows times in the event zone, and a night ending after midnight as one evening', () => {
    // 21:00Z–23:30Z is 22:00–00:30 in Zürich (CET, UTC+1).
    const out = formatEventWhen(ev({ start_date: '2026-11-07T21:00:00Z', end_date: '2026-11-07T23:30:00Z' }), 'en-GB');
    expect(out).toMatch(/^Sat 7 Nov, 22:00.00:30$/);
  });

  it('shows a multi-day festival as a date range', () => {
    const out = formatEventWhen(ev({ start_date: '2026-11-05T09:00:00Z', end_date: '2026-11-08T21:00:00Z' }), 'en-GB');
    expect(out).toBe('Thu 5 Nov – Sun 8 Nov');
  });

  it('falls back to the phone zone for an unknown zone string instead of throwing', () => {
    expect(() => formatEventWhen(ev({ timezone: 'Mars/Olympus' }), 'en-GB')).not.toThrow();
  });
});

describe('rankUpcoming', () => {
  it('puts dated events before standing listings like two-year opening hours', () => {
    const hours = ev({ id: 'h', start_date: '2025-07-01T09:30:00Z', end_date: '2027-06-30T19:00:00Z' });
    const tonight = ev({ id: 't', start_date: '2026-11-01T20:00:00Z', end_date: '2026-11-02T02:00:00Z' });
    const festival = ev({ id: 'f', start_date: '2026-11-05T10:00:00Z', end_date: '2026-11-08T22:00:00Z' });
    expect(isOngoing(hours)).toBe(true);
    expect(isOngoing(festival)).toBe(false);
    expect(rankUpcoming([hours, festival, tonight]).map((e) => e.id)).toEqual(['t', 'f', 'h']);
  });
});

it('prices: free, single, range, unknown', () => {
  const base = { is_free: false, price_min: null, price_max: null, currency: 'CHF' };
  expect(priceLabel({ ...base, is_free: true }, 'en', 'Free')).toBe('Free');
  expect(priceLabel(base, 'en', 'Free')).toBeNull();
  expect(priceLabel({ ...base, price_min: 20 }, 'en', 'Free')).toMatch(/20/);
  expect(priceLabel({ ...base, price_min: 20, price_max: 35 }, 'en', 'Free')).toMatch(/20.*35/);
});

it('events without usable coordinates stay off the map', () => {
  const fc = eventsToGeoJSON([ev({ id: 'a' }), ev({ id: 'b', latitude: null }), ev({ id: 'c', longitude: 500 })]);
  expect(fc.features.map((f) => f.id)).toEqual(['a']);
});
