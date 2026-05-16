/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string; code?: string } | null };
const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));

import { useEntityDetail } from '../useEntityDetail';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useEntityDetail', () => {
  it('is disabled without slug', () => {
    renderHook(
      () => useEntityDetail({ table: 'venues', slug: undefined, queryKey: 'venue' }),
      { wrapper },
    );
    expect(state.calls).toHaveLength(0);
  });

  it('queries table by .eq("slug", slug) and uses custom select', async () => {
    withResults({ data: { id: 'v1' }, error: null });
    const { result } = renderHook(
      () => useEntityDetail({ table: 'venues', slug: 'berghain', joinSpec: 'id,name', queryKey: 'venue' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('venues');
    const select = state.calls[0].chain.find(s => s.method === 'select');
    expect(select?.args).toEqual(['id,name']);
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['slug', 'berghain']);
  });

  it('returns null on PGRST116 instead of throwing', async () => {
    withResults({ data: null, error: { message: 'no rows', code: 'PGRST116' } });
    const { result } = renderHook(
      () => useEntityDetail({ table: 'venues', slug: 'missing', queryKey: 'venue' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('throws on other supabase errors', async () => {
    withResults({ data: null, error: { message: 'rls', code: 'OTHER' } });
    const { result } = renderHook(
      () => useEntityDetail({ table: 'venues', slug: 'x', queryKey: 'venue' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
