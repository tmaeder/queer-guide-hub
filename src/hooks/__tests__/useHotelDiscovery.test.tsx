/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  // Chainable Proxy builder — every method returns the same builder, and the
  // chain itself is thenable so `await supabase.from(...).select(...).x.y.z`
  // resolves to { data: [], error: null }. Mirrors useMarketplaceRows test.
  const builder: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onFulfilled);
        }
        if (prop === 'maybeSingle') {
          return () => Promise.resolve({ data: null, error: null });
        }
        return () => builder;
      },
    },
  );
  return {
    supabase: {
      from: () => builder,
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  };
});

import { useFeaturedHotel, useEditorialHotels, useTopHotelCities } from '../useHotelDiscovery';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useHotelDiscovery', () => {
  it('useFeaturedHotel', () => {
    const { result } = renderHook(() => useFeaturedHotel(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useEditorialHotels', () => {
    const { result } = renderHook(() => useEditorialHotels(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useTopHotelCities', () => {
    const { result } = renderHook(() => useTopHotelCities(), { wrapper });
    expect(result.current).toBeDefined();
  });
});
