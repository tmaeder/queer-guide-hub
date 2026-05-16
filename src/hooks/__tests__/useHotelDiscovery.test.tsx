/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }), limit: () => Promise.resolve({ data: [], error: null }) }), order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) },
}));

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
