/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
const { state, useAuthMock } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useReservations,
  useOrphanReservations,
  useAttachBookingToTrip,
  useDetachBooking,
} from '../useReservations';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('useReservations', () => {
  it('is disabled when not signed in', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useReservations(), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('projects rows + sorts by start_at asc, undated last', async () => {
    withResults({
      data: [
        { id: 'r1', source: 'manual', user_id: 'u1', trip_id: null, type: 'hotel', title: 'B', status: 'pending', start_at: '2026-06-10', end_at: null, provider: null, provider_booking_id: null, confirmation_code: null, booking_url: null, total_amount: null, currency: null, city_id: null, country_id: null, notes: null, created_at: '2026-05-01', trips: null },
        { id: 'r2', source: 'manual', user_id: 'u1', trip_id: null, type: 'flight', title: 'A', status: 'confirmed', start_at: '2026-06-01', end_at: null, provider: null, provider_booking_id: null, confirmation_code: null, booking_url: null, total_amount: null, currency: null, city_id: null, country_id: null, notes: null, created_at: '2026-05-02', trips: null },
        { id: 'r3', source: 'manual', user_id: 'u1', trip_id: null, type: 'other', title: 'No date', status: 'pending', start_at: null, end_at: null, provider: null, provider_booking_id: null, confirmation_code: null, booking_url: null, total_amount: null, currency: null, city_id: null, country_id: null, notes: null, created_at: '2026-05-03', trips: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useReservations(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.map(r => r.id)).toEqual(['r2', 'r1', 'r3']); // r3 undated → last
  });

  it("normalizes unknown source/status/type to 'manual'/'pending'/'other'", async () => {
    withResults({
      data: [
        { id: 'r1', source: 'unknown', user_id: 'u1', trip_id: null, type: 'invalid', title: 'X', status: 'weird', start_at: null, end_at: null, provider: null, provider_booking_id: null, confirmation_code: null, booking_url: null, total_amount: null, currency: null, city_id: null, country_id: null, notes: null, created_at: '', trips: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useReservations(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const r = result.current.data![0];
    expect(r.source).toBe('manual');
    expect(r.type).toBe('other');
    expect(r.status).toBe('pending');
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useReservations(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useOrphanReservations', () => {
  it('filters out reservations with a trip_id', async () => {
    withResults({
      data: [
        { id: 'r1', source: 'manual', user_id: 'u1', trip_id: 't1', type: 'hotel', title: 'A', status: 'pending', start_at: null, end_at: null, provider: null, provider_booking_id: null, confirmation_code: null, booking_url: null, total_amount: null, currency: null, city_id: null, country_id: null, notes: null, created_at: '', trips: { title: 'T' } },
        { id: 'r2', source: 'manual', user_id: 'u1', trip_id: null, type: 'flight', title: 'B', status: 'pending', start_at: null, end_at: null, provider: null, provider_booking_id: null, confirmation_code: null, booking_url: null, total_amount: null, currency: null, city_id: null, country_id: null, notes: null, created_at: '', trips: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useOrphanReservations(), { wrapper });
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.data![0].id).toBe('r2');
  });
});

describe('useAttachBookingToTrip', () => {
  it('updates reservations.trip_id by id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useAttachBookingToTrip(), { wrapper });
    await result.current.mutateAsync({ reservationId: 'r1', tripId: 't1' });

    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ trip_id: 't1' });
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'r1']);
  });
});

describe('useDetachBooking', () => {
  it('clears reservations.trip_id by id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useDetachBooking(), { wrapper });
    await result.current.mutateAsync('r1');

    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ trip_id: null });
  });
});
