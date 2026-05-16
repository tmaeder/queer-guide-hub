/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.order = () => Promise.resolve({ data: [], error: null });
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    return chain;
  },
  untypedSupabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import { useMyPlaceMarks, useEntityMarks, useTogglePlaceMark, useFootprintEntities, useFootprintCityTotals, useCityMarkableTotals } from '../usePlaceMarks';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePlaceMarks', () => {
  it('useMyPlaceMarks', () => {
    const { result } = renderHook(() => useMyPlaceMarks(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useEntityMarks', () => {
    const { result } = renderHook(() => useEntityMarks('venue', 'v1'), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useTogglePlaceMark', () => {
    const { result } = renderHook(() => useTogglePlaceMark(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useFootprintEntities', () => {
    const { result } = renderHook(() => useFootprintEntities({ venue: [], event: [], village: [] }), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useFootprintCityTotals', () => {
    const { result } = renderHook(() => useFootprintCityTotals([]), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useCityMarkableTotals', () => {
    const { result } = renderHook(() => useCityMarkableTotals('c1'), { wrapper });
    expect(result.current).toBeDefined();
  });
});
