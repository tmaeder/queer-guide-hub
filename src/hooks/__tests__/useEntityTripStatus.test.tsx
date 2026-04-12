import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useEntityTripStatus } from '../useEntityTripStatus';

const w = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useEntityTripStatus', () => {
  it('should return placeholder data when entity provided', () => {
    const { result } = renderHook(() => useEntityTripStatus('venue', 'v-1'), { wrapper: w() });
    expect(result.current.data).toEqual({ isInTrip: false, tripNames: [], tripIds: [], count: 0 });
  });

  it('should not fetch when no entityId', () => {
    const { result } = renderHook(() => useEntityTripStatus('venue', undefined), { wrapper: w() });
    expect(result.current.isFetching).toBe(false);
  });
});
