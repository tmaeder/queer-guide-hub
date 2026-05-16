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

import { useUpcomingPrideEvents } from '../useUpcomingPrideEvents';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useUpcomingPrideEvents', () => {
  it('applies pride/festival or-clause, date window, default limit 12', async () => {
    withResults({ data: [{ id: 'e1' }], error: null });
    renderHook(() => useUpcomingPrideEvents(), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const call = state.calls[0];
    expect(call.table).toBe('events');
    const or = call.chain.find(s => s.method === 'or');
    expect(or?.args[0]).toMatch(/event_type\.ilike\.%pride%/);
    expect(call.chain.find(s => s.method === 'gte')?.args[0]).toBe('start_date');
    expect(call.chain.find(s => s.method === 'lte')?.args[0]).toBe('start_date');
    expect(call.chain.find(s => s.method === 'is')?.args).toEqual(['duplicate_of_id', null]);
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([12]);
  });

  it('respects enabled=false', () => {
    renderHook(() => useUpcomingPrideEvents({ enabled: false }), { wrapper });
    expect(state.calls).toHaveLength(0);
  });
});
