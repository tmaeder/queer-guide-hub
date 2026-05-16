import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { hotellookProvider } from '../providers/hotellook';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('hotellookProvider identity', () => {
  it('declares name, vertical, in-app=false', () => {
    expect(hotellookProvider.name).toBe('hotellook');
    expect(hotellookProvider.vertical).toBe('hotel');
    expect(hotellookProvider.supportsInApp).toBe(false);
  });
});

describe('hotellookProvider.search', () => {
  it('returns [] when cityName missing', async () => {
    expect(await hotellookProvider.search({ vertical: 'hotel' })).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes hotel-search with all params', async () => {
    invokeMock.mockResolvedValueOnce({ data: { hotels: [] }, error: null });
    await hotellookProvider.search({
      vertical: 'hotel',
      cityName: 'Berlin',
      checkIn: '2026-06-01',
      checkOut: '2026-06-05',
      guests: 3,
      currency: 'usd',
      limit: 5,
    });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body).toMatchObject({
      city: 'Berlin',
      checkIn: '2026-06-01',
      checkOut: '2026-06-05',
      guests: 3,
      currency: 'usd',
      limit: 5,
    });
  });

  it('returns [] on edge error or missing hotels array', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    expect(await hotellookProvider.search({ vertical: 'hotel', cityName: 'X' })).toEqual([]);

    invokeMock.mockResolvedValueOnce({ data: { hotels: null }, error: null });
    expect(await hotellookProvider.search({ vertical: 'hotel', cityName: 'X' })).toEqual([]);
  });

  it('maps Hotellook rows to BookingResult', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        hotels: [
          {
            hotelId: 'h1',
            hotelName: 'Hotel One',
            location: 'Berlin',
            photoUrl: 'p.jpg',
            priceFrom: 120,
            priceOld: 150,
            currency: 'EUR',
            rating: 4.5,
            reviews: 200,
            stars: 4,
            lgbtqFriendly: true,
            bookingUrl: 'https://hotellook.com/x',
          },
        ],
      },
      error: null,
    });

    const r = await hotellookProvider.search({ vertical: 'hotel', cityName: 'Berlin' });
    expect(r[0]).toMatchObject({
      id: 'hl-h1',
      provider: 'hotellook',
      vertical: 'hotel',
      title: 'Hotel One',
      subtitle: 'Berlin',
      imageUrl: 'p.jpg',
      price: 120,
      originalPrice: 150,
      currency: 'EUR',
      rating: 4.5,
      reviewCount: 200,
      starRating: 4,
      lgbtqFriendly: true,
      bookingUrl: 'https://hotellook.com/x',
      supportsInApp: false,
    });
  });
});

describe('hotellookProvider.getBookingUrl', () => {
  it('returns result bookingUrl when present', () => {
    const url = hotellookProvider.getBookingUrl!({
      id: 'x', provider: 'hotellook', vertical: 'hotel', title: 't',
      price: 0, currency: 'EUR', bookingUrl: 'https://hotellook.com/y', supportsInApp: false,
    });
    expect(url).toBe('https://hotellook.com/y');
  });

  it('falls back to Booking.com affiliate URL (Hotellook sunset)', () => {
    const url = hotellookProvider.getBookingUrl!({
      id: 'x', provider: 'hotellook', vertical: 'hotel', title: 't',
      price: 0, currency: 'EUR', supportsInApp: false,
    });
    expect(url).toBe('https://www.booking.com?aid=2381426&label=queerguide-452012');
  });
});
