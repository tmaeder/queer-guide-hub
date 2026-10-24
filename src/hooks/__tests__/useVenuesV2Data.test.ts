import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { TestProviders } from '@/test/test-utils';

const { auth, fetches } = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null },
  fetches: { count: 0 },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: vi.fn(), untypedRpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'is', 'not', 'order', 'limit', 'ilike'])
    builder[m] = () => builder;
  builder.maybeSingle = () => {
    fetches.count += 1;
    return Promise.resolve({ data: { id: `v${fetches.count}` } });
  };
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: [{ id: 'c1', name: 'Berlin' }] });
  return { supabase: { from: () => builder } };
});

import { useCityAutocomplete, useFeaturedVenue } from '../useVenuesV2Data';

describe('useVenuesV2Data', () => {
  beforeEach(() => {
    auth.user = null;
    fetches.count = 0;
  });

  // venues are safety-gated by RLS and the cache is not cleared on sign-out,
  // so a signed-in result must live under a different key than the anon one.
  it('does not serve a signed-in venues result to the anonymous viewer', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(TestProviders, { queryClient: client }, children);

    auth.user = { id: 'u1' };
    const { result, rerender } = renderHook(() => useFeaturedVenue(), { wrapper });
    await waitFor(() => expect(result.current.venue).toEqual({ id: 'v1' }));

    auth.user = null;
    rerender();
    await waitFor(() => expect(result.current.venue).toEqual({ id: 'v2' }));
    expect(fetches.count).toBe(2);
  });

  it('only queries cities from two characters on', async () => {
    const { result, rerender } = renderHook(({ q }) => useCityAutocomplete(q), {
      wrapper: TestProviders,
      initialProps: { q: 'B' },
    });
    expect(result.current).toEqual([]);
    rerender({ q: 'Be' });
    await waitFor(() => expect(result.current).toEqual([{ id: 'c1', name: 'Berlin' }]));
  });
});
