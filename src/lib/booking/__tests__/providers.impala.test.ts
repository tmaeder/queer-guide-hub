import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { impalaProvider } from '../providers/impala';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('impalaProvider identity', () => {
  it('declares name, vertical, in-app support', () => {
    expect(impalaProvider.name).toBe('impala');
    expect(impalaProvider.vertical).toBe('hotel');
    expect(impalaProvider.supportsInApp).toBe(true);
  });
});

describe('impalaProvider.search', () => {
  it('returns empty array when cityName is missing', async () => {
    expect(await impalaProvider.search({ vertical: 'hotel' })).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('returns empty array when the edge function errors', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await impalaProvider.search({ vertical: 'hotel', cityName: 'Berlin' })).toEqual([]);
  });

  it('maps Impala hotels to BookingResult shape', async () => {
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
          },
        ],
      },
      error: null,
    });

    const r = await impalaProvider.search({
      vertical: 'hotel',
      cityName: 'Berlin',
      checkIn: '2026-06-01',
      checkOut: '2026-06-05',
    });

    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: 'impala-h1',
      provider: 'impala',
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
      supportsInApp: true,
    });
    expect(r[0].bookingUrl).toBeUndefined();
  });
});

describe('impalaProvider.getRoomOptions', () => {
  it('returns empty array on error', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const r = await impalaProvider.getRoomOptions!('h1', { vertical: 'hotel' });
    expect(r).toEqual([]);
  });

  it('maps rooms to BookingRoom', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        rooms: [
          {
            id: 'r1',
            name: 'Suite',
            price: 200,
            currency: 'USD',
            cancellationPolicy: 'flex',
            breakfastIncluded: true,
          },
        ],
      },
      error: null,
    });

    const r = await impalaProvider.getRoomOptions!('h1', { vertical: 'hotel' });
    expect(r).toEqual([
      {
        roomId: 'r1',
        roomName: 'Suite',
        price: 200,
        currency: 'USD',
        cancellationPolicy: 'flex',
        breakfastIncluded: true,
      },
    ]);
  });
});

describe('impalaProvider.createBooking', () => {
  it('throws on edge function error', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'no inventory' } });
    await expect(
      impalaProvider.createBooking!({
        provider: 'impala',
        providerItemId: 'h1',
        vertical: 'hotel',
        checkIn: '2026-06-01',
        checkOut: '2026-06-05',
        guests: 2,
      }),
    ).rejects.toThrow('no inventory');
  });

  it('returns a BookingConfirmation on success', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        bookingId: 'b1',
        providerBookingId: 'p1',
        status: 'confirmed',
        confirmationCode: 'XYZ',
        totalAmount: 400,
        currency: 'EUR',
        cancellationUrl: 'https://cancel/x',
      },
      error: null,
    });

    const result = await impalaProvider.createBooking!({
      provider: 'impala',
      providerItemId: 'h1',
      vertical: 'hotel',
      checkIn: '2026-06-01',
      checkOut: '2026-06-05',
      guests: 2,
    });

    expect(result).toEqual({
      bookingId: 'b1',
      providerBookingId: 'p1',
      provider: 'impala',
      status: 'confirmed',
      confirmationCode: 'XYZ',
      totalAmount: 400,
      currency: 'EUR',
      cancellationUrl: 'https://cancel/x',
    });
  });
});

describe('impalaProvider.cancelBooking', () => {
  it('returns success:false with the error message on failure', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'too late' } });
    expect(await impalaProvider.cancelBooking!('b1')).toEqual({
      success: false,
      error: 'too late',
    });
  });

  it('returns success:true when edge function succeeds', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true }, error: null });
    expect(await impalaProvider.cancelBooking!('b1')).toEqual({ success: true });
  });
});

describe('impalaProvider.getBookingStatus', () => {
  it("defaults to 'pending' when edge function returns no data", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await impalaProvider.getBookingStatus!('p1')).toBe('pending');
  });

  it('returns the reported status', async () => {
    invokeMock.mockResolvedValueOnce({ data: { status: 'confirmed' }, error: null });
    expect(await impalaProvider.getBookingStatus!('p1')).toBe('confirmed');
  });
});
