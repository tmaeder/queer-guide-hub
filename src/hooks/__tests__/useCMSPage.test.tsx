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

import { useCMSPage } from '../useCMSPage';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useCMSPage', () => {
  it('is disabled without slug', () => {
    renderHook(() => useCMSPage(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('returns notFound when page missing', async () => {
    withResults({ data: null, error: { message: 'no rows' } });
    const { result } = renderHook(() => useCMSPage('missing'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.notFound).toBe(true);
  });

  it('returns page + parent + children for a hub-style page', async () => {
    withResults(
      { data: { slug: 'topic-a', parent_slug: 'hub', workflow_state: 'published' }, error: null },
      { data: { slug: 'hub', title: 'Hub' }, error: null },
      { data: [{ slug: 'child', title: 'Child' }], error: null },
    );

    const { result } = renderHook(() => useCMSPage('topic-a'), { wrapper });
    await waitFor(() => expect(result.current.data?.notFound).toBe(false));

    expect(result.current.data?.page?.slug).toBe('topic-a');
    expect(result.current.data?.parent?.slug).toBe('hub');
    expect(result.current.data?.children[0].slug).toBe('child');
  });
});
