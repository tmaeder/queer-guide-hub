/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const untypedFromSpy = vi.fn();

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: (...args: unknown[]) => {
    untypedFromSpy(...args);
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.delete = () => chain;
    chain.insert = () => Promise.resolve({ data: null, error: null });
    chain.order = () => Promise.resolve({ data: [], error: null });
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    return chain;
  },
  untypedSupabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import {
  useMyPlaceMarks,
  useEntityMarks,
  useTogglePlaceMark,
  useFootprintEntities,
  useFootprintCityTotals,
  useCityMarkableTotals,
} from '../usePlaceMarks';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  untypedFromSpy.mockClear();
});

describe('usePlaceMarks', () => {
  it('useMyPlaceMarks queries the user_place_marks table via untypedFrom', async () => {
    const { result } = renderHook(() => useMyPlaceMarks(), { wrapper });
    expect(result.current).toBeDefined();
    await waitFor(() =>
      expect(untypedFromSpy.mock.calls.some((c) => c[0] === 'user_place_marks')).toBe(true),
    );
  });

  it('useEntityMarks queries the user_place_marks table via untypedFrom', async () => {
    const { result } = renderHook(() => useEntityMarks('venue', 'v1'), { wrapper });
    expect(result.current).toBeDefined();
    await waitFor(() =>
      expect(untypedFromSpy.mock.calls.some((c) => c[0] === 'user_place_marks')).toBe(true),
    );
  });

  it('useTogglePlaceMark mutation completes (does not throw ReferenceError)', async () => {
    const { result } = renderHook(() => useTogglePlaceMark(), { wrapper });
    // Returns a mutation object with mutateAsync; calling it should not throw
    // a ReferenceError. This is the regression test for D2 — bare `supabase`
    // references previously crashed inside the mutationFn.
    await expect(
      result.current.mutateAsync({
        entity_type: 'venue',
        entity_id: 'v1',
        mark_type: 'saved',
      }),
    ).resolves.toBeDefined();
    expect(untypedFromSpy).toHaveBeenCalledWith('user_place_marks');
  });

  it('useFootprintEntities is callable', () => {
    const { result } = renderHook(
      () => useFootprintEntities({ venue: [], event: [], village: [] }),
      { wrapper },
    );
    expect(result.current).toBeDefined();
  });
  it('useFootprintCityTotals is callable', () => {
    const { result } = renderHook(() => useFootprintCityTotals([]), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useCityMarkableTotals is callable', () => {
    const { result } = renderHook(() => useCityMarkableTotals('c1'), { wrapper });
    expect(result.current).toBeDefined();
  });
});
