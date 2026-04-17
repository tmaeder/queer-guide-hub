import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

import { useTripReservations, useReservationMutations } from '../useTripReservations';

const w = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useTripReservations', () => {
  it('should not fetch when no tripId', () => {
    const { result } = renderHook(() => useTripReservations(undefined), { wrapper: w() });
    expect(result.current.isFetching).toBe(false);
  });

  it('should return query shape with tripId', () => {
    const { result } = renderHook(() => useTripReservations('trip-1'), { wrapper: w() });
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
  });
});

describe('useReservationMutations', () => {
  it('should expose add, update, delete mutations', () => {
    const { result } = renderHook(() => useReservationMutations('trip-1'), { wrapper: w() });
    expect(result.current.addReservation).toHaveProperty('mutate');
    expect(result.current.updateReservation).toHaveProperty('mutate');
    expect(result.current.deleteReservation).toHaveProperty('mutate');
  });
});
