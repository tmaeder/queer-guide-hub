import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { getyourguideProvider } from '../providers/getyourguide';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('getyourguideProvider identity', () => {
  it('declares name, vertical, in-app=false', () => {
    expect(getyourguideProvider.name).toBe('getyourguide');
    expect(getyourguideProvider.vertical).toBe('activity');
    expect(getyourguideProvider.supportsInApp).toBe(false);
  });
});

describe('getyourguideProvider.search', () => {
  it('returns [] when neither cityName nor latitude is provided', async () => {
    const r = await getyourguideProvider.search({ vertical: 'activity' });
    expect(r).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes activity-search with all params (cityName branch)', async () => {
    invokeMock.mockResolvedValueOnce({ data: { activities: [] }, error: null });
    await getyourguideProvider.search({
      vertical: 'activity',
      cityName: 'Berlin',
      category: 'food',
      checkIn: '2026-06-01',
      currency: 'usd',
      limit: 5,
    });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body).toMatchObject({
      city: 'Berlin',
      category: 'food',
      date: '2026-06-01',
      currency: 'usd',
      limit: 5,
    });
  });

  it('uses latitude-only when cityName missing', async () => {
    invokeMock.mockResolvedValueOnce({ data: { activities: [] }, error: null });
    await getyourguideProvider.search({
      vertical: 'activity',
      latitude: 52.52,
      longitude: 13.405,
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.latitude).toBe(52.52);
  });

  it('returns [] on edge error', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const r = await getyourguideProvider.search({ vertical: 'activity', cityName: 'Berlin' });
    expect(r).toEqual([]);
  });

  it('maps activity rows to BookingResult', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        activities: [
          {
            activityId: 'a1',
            title: 'Walking Tour',
            abstract: 'See the highlights',
            imageUrl: 'img.jpg',
            price: 25,
            originalPrice: 30,
            currency: 'EUR',
            rating: 4.6,
            reviewCount: 120,
            duration: '2h',
            category: 'tours',
            bookingUrl: 'https://gyg.com/x',
          },
        ],
      },
      error: null,
    });

    const r = await getyourguideProvider.search({ vertical: 'activity', cityName: 'Berlin' });
    expect(r[0]).toMatchObject({
      id: 'gyg-a1',
      provider: 'getyourguide',
      vertical: 'activity',
      title: 'Walking Tour',
      price: 25,
      currency: 'EUR',
      durationText: '2h',
      supportsInApp: false,
    });
  });
});

describe('getyourguideProvider.getBookingUrl', () => {
  it('returns the result bookingUrl when present', () => {
    const url = getyourguideProvider.getBookingUrl!({
      id: 'x', provider: 'getyourguide', vertical: 'activity', title: 't',
      price: 0, currency: 'EUR', bookingUrl: 'https://gyg.com/y', supportsInApp: false,
    });
    expect(url).toBe('https://gyg.com/y');
  });

  it('falls back to the canonical partner URL', () => {
    const url = getyourguideProvider.getBookingUrl!({
      id: 'x', provider: 'getyourguide', vertical: 'activity', title: 't',
      price: 0, currency: 'EUR', supportsInApp: false,
    });
    expect(url).toBe('https://www.getyourguide.com/?partner_id=2PBDXWH');
  });
});
