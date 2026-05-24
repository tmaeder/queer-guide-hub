import { describe, it, expect } from 'vitest';
import { buildClusters } from '../PrideTrips';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

const mk = (overrides: Partial<PrideCalendarEvent> & { id: string }): PrideCalendarEvent => ({
  slug: overrides.id,
  title: overrides.id,
  start_date: '2026-06-15T00:00:00.000Z',
  end_date: null,
  city: null,
  city_id: null,
  country: null,
  country_id: null,
  latitude: 0,
  longitude: 0,
  images: null,
  is_featured: false,
  verification_status: 'verified',
  description: null,
  ...overrides,
});

describe('buildClusters', () => {
  it('returns empty when fewer than 2 events', () => {
    expect(buildClusters([])).toEqual([]);
    expect(buildClusters([mk({ id: 'a' })])).toEqual([]);
  });

  it('drops events without lat/lng', () => {
    const r = buildClusters([
      mk({ id: 'a', latitude: null, longitude: null, start_date: '2026-07-01T00:00:00Z' }),
      mk({ id: 'b', latitude: 52.52, longitude: 13.4, start_date: '2026-07-04T00:00:00Z' }),
    ]);
    expect(r).toEqual([]);
  });

  it('clusters two events within 14 days + <1500 km', () => {
    const r = buildClusters([
      mk({ id: 'berlin', latitude: 52.52, longitude: 13.4, start_date: '2026-07-25T00:00:00Z' }),
      mk({ id: 'cologne', latitude: 50.94, longitude: 6.96, start_date: '2026-08-01T00:00:00Z' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].events.map((e) => e.id)).toEqual(['berlin', 'cologne']);
    expect(r[0].span).toBe(7);
    expect(r[0].totalKm).toBeGreaterThan(400);
    expect(r[0].totalKm).toBeLessThan(600);
  });

  it('does not cluster events more than 14 days apart', () => {
    const r = buildClusters([
      mk({ id: 'a', latitude: 52.52, longitude: 13.4, start_date: '2026-07-01T00:00:00Z' }),
      mk({ id: 'b', latitude: 50.94, longitude: 6.96, start_date: '2026-07-20T00:00:00Z' }),
    ]);
    expect(r).toEqual([]);
  });

  it('does not cluster events more than 1500 km apart', () => {
    const r = buildClusters([
      mk({ id: 'berlin', latitude: 52.52, longitude: 13.4, start_date: '2026-07-01T00:00:00Z' }),
      mk({ id: 'nyc', latitude: 40.71, longitude: -74.01, start_date: '2026-07-04T00:00:00Z' }),
    ]);
    expect(r).toEqual([]);
  });

  it('chains 3 events when each leg satisfies day+km thresholds', () => {
    const r = buildClusters([
      mk({ id: 'berlin', latitude: 52.52, longitude: 13.4, start_date: '2026-07-25T00:00:00Z' }),
      mk({ id: 'amsterdam', latitude: 52.37, longitude: 4.9, start_date: '2026-08-01T00:00:00Z' }),
      mk({ id: 'antwerp', latitude: 51.22, longitude: 4.4, start_date: '2026-08-08T00:00:00Z' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].events.map((e) => e.id)).toEqual(['berlin', 'amsterdam', 'antwerp']);
  });

  it('ranks clusters with more featured events first', () => {
    const events: PrideCalendarEvent[] = [
      mk({ id: 'a1', latitude: 52.52, longitude: 13.4, start_date: '2026-07-01T00:00:00Z' }),
      mk({ id: 'a2', latitude: 50.94, longitude: 6.96, start_date: '2026-07-08T00:00:00Z' }),
      mk({ id: 'b1', latitude: 48.86, longitude: 2.35, start_date: '2026-08-01T00:00:00Z', is_featured: true }),
      mk({ id: 'b2', latitude: 51.5, longitude: -0.13, start_date: '2026-08-08T00:00:00Z' }),
    ];
    const r = buildClusters(events);
    expect(r).toHaveLength(2);
    expect(r[0].events.map((e) => e.id)).toEqual(['b1', 'b2']);
  });

  it('caps the result list at 6 clusters', () => {
    const lats = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66];
    const events = lats.map((lat, i) =>
      mk({
        id: `e${i}`,
        latitude: lat,
        longitude: 5,
        start_date: `2026-07-${(i % 14) + 1}T00:00:00Z`,
      }),
    );
    expect(buildClusters(events).length).toBeLessThanOrEqual(6);
  });

  it('marks each event as used in at most one cluster', () => {
    const events: PrideCalendarEvent[] = [
      mk({ id: 'a', latitude: 52.52, longitude: 13.4, start_date: '2026-07-01T00:00:00Z' }),
      mk({ id: 'b', latitude: 50.94, longitude: 6.96, start_date: '2026-07-08T00:00:00Z' }),
      mk({ id: 'c', latitude: 48.86, longitude: 2.35, start_date: '2026-07-15T00:00:00Z' }),
    ];
    const r = buildClusters(events);
    const seen = new Set<string>();
    for (const c of r) for (const e of c.events) {
      expect(seen.has(e.id)).toBe(false);
      seen.add(e.id);
    }
  });

  it('caps a single cluster at 4 events', () => {
    const events: PrideCalendarEvent[] = [
      mk({ id: 'berlin',    latitude: 52.52, longitude: 13.4,  start_date: '2026-07-01T00:00:00Z' }),
      mk({ id: 'cologne',   latitude: 50.94, longitude: 6.96, start_date: '2026-07-04T00:00:00Z' }),
      mk({ id: 'amsterdam', latitude: 52.37, longitude: 4.9,  start_date: '2026-07-08T00:00:00Z' }),
      mk({ id: 'brussels',  latitude: 50.85, longitude: 4.35, start_date: '2026-07-12T00:00:00Z' }),
      mk({ id: 'paris',     latitude: 48.86, longitude: 2.35, start_date: '2026-07-15T00:00:00Z' }),
    ];
    const r = buildClusters(events);
    expect(r).toHaveLength(1);
    expect(r[0].events).toHaveLength(4);
  });

  it('caps a single cluster span at 21 days', () => {
    const events: PrideCalendarEvent[] = [
      mk({ id: 'a', latitude: 52.52, longitude: 13.4,  start_date: '2026-07-01T00:00:00Z' }),
      mk({ id: 'b', latitude: 50.94, longitude: 6.96, start_date: '2026-07-14T00:00:00Z' }), // +13d
      mk({ id: 'c', latitude: 52.37, longitude: 4.9,  start_date: '2026-07-26T00:00:00Z' }), // +25d total → over 21d
    ];
    const r = buildClusters(events);
    expect(r).toHaveLength(1);
    expect(r[0].events.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
