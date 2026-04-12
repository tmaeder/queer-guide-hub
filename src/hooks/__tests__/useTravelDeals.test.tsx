import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { deals: [] }, error: null }) } },
}));

import { useTravelDeals } from '../useTravelDeals';

const w = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useTravelDeals', () => {
  it('should return query shape', () => {
    const { result } = renderHook(() => useTravelDeals({ origin: 'ZRH' }), { wrapper: w() });
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
  });

  it('should be disabled when no origin', () => {
    const { result } = renderHook(() => useTravelDeals({ origin: null }), { wrapper: w() });
    expect(result.current.isFetching).toBe(false);
  });
});
