import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h), rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } };
});

import { useTrips, useTripMutations } from '../useTrips';
const w = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };

describe('useTrips', () => {
  it('should return query shape', () => {
    const { result } = renderHook(() => useTrips(), { wrapper: w() });
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
  });
});

describe('useTripMutations', () => {
  it('should return mutation objects', () => {
    const { result } = renderHook(() => useTripMutations(), { wrapper: w() });
    expect(result.current.createTrip).toHaveProperty('mutateAsync');
    expect(result.current.deleteTrip).toHaveProperty('mutate');
    expect(result.current.addPlace).toHaveProperty('mutate');
  });
});
