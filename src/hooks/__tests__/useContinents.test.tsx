/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
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

import { useContinents } from '../useContinents';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useContinents', () => {
  it('queries continents ordered by name', async () => {
    withResults({ data: [{ id: 'eu', name: 'Europe' }], error: null });
    const { result } = renderHook(() => useContinents(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('continents');
    const order = state.calls[0].chain.find(s => s.method === 'order');
    expect(order?.args).toEqual(['name']);
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useContinents(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
