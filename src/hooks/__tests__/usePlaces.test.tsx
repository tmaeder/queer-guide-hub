/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }), order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

import { useOptimizedCountries, useOptimizedCities, useOptimizedCountry, useOptimizedCity } from '../usePlaces';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePlaces', () => {
  it('useOptimizedCountries', () => {
    const { result } = renderHook(() => useOptimizedCountries(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useOptimizedCities', () => {
    const { result } = renderHook(() => useOptimizedCities(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useOptimizedCountry', () => {
    const { result } = renderHook(() => useOptimizedCountry('germany'), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useOptimizedCity', () => {
    const { result } = renderHook(() => useOptimizedCity('berlin'), { wrapper });
    expect(result.current).toBeDefined();
  });
});
