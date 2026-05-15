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
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  },
}));

import { useTripNews, __testing } from '../useTripNews';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('isSafetyFlagged', () => {
  it('flags articles that mention both safety + queer terms', () => {
    expect(__testing.isSafetyFlagged('Attack on gay pride parade', null)).toBe(true);
    expect(__testing.isSafetyFlagged('Police raid LGBTQ bar', null)).toBe(true);
  });

  it('does not flag pure-safety news without queer relevance', () => {
    expect(__testing.isSafetyFlagged('Tourist attack at airport', null)).toBe(false);
  });

  it('does not flag pure-queer news without safety relevance', () => {
    expect(__testing.isSafetyFlagged('Drag brunch at new venue', null)).toBe(false);
  });

  it('reads excerpt as well as title', () => {
    expect(
      __testing.isSafetyFlagged('Festival starts today', 'Protest planned by trans activists'),
    ).toBe(true);
  });
});

describe('useTripNews', () => {
  it('is disabled when countryIds is empty', () => {
    renderHook(() => useTripNews([]), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries news_articles with .overlaps + recency filter', async () => {
    withResults({
      data: [
        { id: 'n1', title: 'Pride attack in Berlin', excerpt: 'gay community responds', country_ids: ['de'] },
        { id: 'n2', title: 'Drag show roundup', excerpt: 'nothing alarming', country_ids: ['de'] },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTripNews(['de']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.map(a => a.id)).toEqual(['n1', 'n2']);
    expect(result.current.data?.find(a => a.id === 'n1')?.isSafetyFlagged).toBe(true);
    expect(result.current.data?.find(a => a.id === 'n2')?.isSafetyFlagged).toBe(false);

    const call = state.calls[0];
    expect(call.table).toBe('news_articles');
    const overlaps = call.chain.find(s => s.method === 'overlaps');
    expect(overlaps?.args).toEqual(['country_ids', ['de']]);
    const gte = call.chain.find(s => s.method === 'gte');
    expect(gte?.args[0]).toBe('published_at');
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useTripNews(['de']), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
