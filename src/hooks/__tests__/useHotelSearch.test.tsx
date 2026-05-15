/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { useHotelSearch } from '../useHotelSearch';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  invokeMock.mockReset();
});

describe('useHotelSearch', () => {
  it('is disabled when city is missing', () => {
    renderHook(() => useHotelSearch({ city: undefined }), { wrapper });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes hotel-search edge with all parameters', async () => {
    invokeMock.mockResolvedValueOnce({ data: { hotels: [] }, error: null });

    const { result } = renderHook(
      () => useHotelSearch({
        city: 'Berlin',
        checkIn: '2026-06-01',
        checkOut: '2026-06-05',
        guests: 3,
        currency: 'usd',
        limit: 5,
        hotelType: 'boutique',
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body).toMatchObject({
      city: 'Berlin',
      checkIn: '2026-06-01',
      checkOut: '2026-06-05',
      guests: 3,
      currency: 'usd',
      limit: 5,
      hotelType: 'boutique',
    });
  });

  it('maps Hotellook rows to BookingResult shape', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        hotels: [
          { hotelId: 'h1', hotelName: 'Hotel One', priceFrom: 100, rating: 4.5, currency: 'EUR' },
        ],
      },
      error: null,
    });

    const { result } = renderHook(() => useHotelSearch({ city: 'Berlin' }), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0]).toMatchObject({
      id: 'hl-h1',
      provider: 'hotellook',
      title: 'Hotel One',
      price: 100,
      currency: 'EUR',
      supportsInApp: false,
    });
  });

  it('filters out hotels without a valid price', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        hotels: [
          { hotelId: 'a', hotelName: 'Bad', priceFrom: 0 },
          { hotelId: 'b', hotelName: 'Good', priceFrom: 80 },
        ],
      },
      error: null,
    });

    const { result } = renderHook(() => useHotelSearch({ city: 'Berlin' }), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map(h => h.id)).toEqual(['hl-b']);
  });

  it('respects client-side price min/max bounds', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        hotels: [
          { hotelId: 'cheap', hotelName: 'Cheap', priceFrom: 30 },
          { hotelId: 'mid', hotelName: 'Mid', priceFrom: 100 },
          { hotelId: 'pricey', hotelName: 'Pricey', priceFrom: 500 },
        ],
      },
      error: null,
    });

    const { result } = renderHook(
      () => useHotelSearch({ city: 'Berlin', priceMin: 50, priceMax: 300 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map(h => h.id)).toEqual(['hl-mid']);
  });

  it('filters to lgbtqFriendly===true when requested', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        hotels: [
          { hotelId: 'a', hotelName: 'A', priceFrom: 100, lgbtqFriendly: true },
          { hotelId: 'b', hotelName: 'B', priceFrom: 100, lgbtqFriendly: false },
          { hotelId: 'c', hotelName: 'C', priceFrom: 100 },
        ],
      },
      error: null,
    });

    const { result } = renderHook(
      () => useHotelSearch({ city: 'Berlin', lgbtqFriendlyOnly: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map(h => h.id)).toEqual(['hl-a']);
  });

  it('returns empty array on edge error or missing data', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useHotelSearch({ city: 'Berlin' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
