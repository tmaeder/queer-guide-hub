/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from() {
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return () => builder;
          },
        },
      );
      return builder;
    },
  },
}));

import { useTripBookingClicks } from '../useTripBookingClicks';

function withResults(...r: MockResult[]) {
  state.results.push(...r);
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
});

describe('useTripBookingClicks', () => {
  it('is disabled when tripId is undefined', () => {
    const { result } = renderHook(() => useTripBookingClicks(undefined), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('aggregates clicks into byVertical / byProvider / recent', async () => {
    withResults({
      data: [
        { id: '1', vertical: 'hotel', provider: 'Booking', clicked_at: '2026-04-10' },
        { id: '2', vertical: 'hotel', provider: 'Booking', clicked_at: '2026-04-09' },
        { id: '3', vertical: 'activity', provider: 'GetYourGuide', clicked_at: '2026-04-08' },
        { id: '4', vertical: 'flight', provider: 'Aviasales', clicked_at: '2026-04-07' },
        { id: '5', vertical: 'restaurant', provider: 'Booking', clicked_at: '2026-04-06' },
        { id: '6', vertical: 'other', provider: 'Misc', clicked_at: '2026-04-05' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTripBookingClicks('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const summary = result.current.data!;
    expect(summary.total).toBe(6);
    expect(summary.byVertical).toEqual({
      hotel: 2,
      activity: 1,
      flight: 1,
      restaurant: 1,
      other: 1,
    });
    expect(summary.byProvider).toEqual({
      Booking: 3,
      GetYourGuide: 1,
      Aviasales: 1,
      Misc: 1,
    });
    // recent capped at 5 rows in insertion order.
    expect(summary.recent.map(r => r.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('returns zeroed summary when no rows exist', async () => {
    withResults({ data: [], error: null });
    const { result } = renderHook(() => useTripBookingClicks('trip-2'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({
      total: 0,
      byVertical: { hotel: 0, activity: 0, flight: 0, restaurant: 0, other: 0 },
      byProvider: {},
      recent: [],
    });
  });

  it('surfaces error when the query fails', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useTripBookingClicks('trip-3'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ message: 'denied' });
  });
});
