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
  calls: [] as Array<{ table?: string; rpc?: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));

import {
  useTopicGuides,
  useTopicOrgs,
  useTopicNews,
  useSupportOrgs,
} from '../useResourceTopic';

function withResults(...r: MockResult[]) { state.results.push(...r); }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useTopicGuides', () => {
  it('is disabled without parentSlug', () => {
    const { result } = renderHook(() => useTopicGuides(undefined), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it('queries cms_pages filtered to parent_slug + published, ordered by title', async () => {
    withResults({ data: [{ slug: 'g1', title: 'Guide One' }], error: null });
    const { result } = renderHook(() => useTopicGuides('lgbt-health'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual([{ slug: 'g1', title: 'Guide One' }]);
    const call = state.calls[0];
    expect(call.table).toBe('cms_pages');
    const eqs = call.chain.filter(s => s.method === 'eq');
    expect(eqs.map(e => e.args)).toEqual(
      expect.arrayContaining([
        ['parent_slug', 'lgbt-health'],
        ['workflow_state', 'published'],
      ]),
    );
  });
});

describe('useTopicOrgs', () => {
  it('is disabled when tagCluster is empty', () => {
    renderHook(() => useTopicOrgs([]), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('calls the get_venues_by_tag RPC with cluster + limit', async () => {
    withResults({ data: [{ id: 'v1', name: 'Venue' }], error: null });
    const { result } = renderHook(() => useTopicOrgs(['health', 'mental-health']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.rpc).toBe('get_venues_by_tag');
    const [, args] = call.chain[0].args as [string, Record<string, unknown>];
    expect(args.tag_values).toEqual(['health', 'mental-health']);
    expect(args.max_results).toBe(12);
  });
});

describe('useTopicNews', () => {
  it('is disabled when tagCluster is empty', () => {
    renderHook(() => useTopicNews(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries news_articles with .overlaps and approved quality', async () => {
    withResults({ data: [{ id: 'n1', title: 'Story' }], error: null });
    const { result } = renderHook(() => useTopicNews(['health']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.table).toBe('news_articles');
    const overlaps = call.chain.find(s => s.method === 'overlaps');
    expect(overlaps?.args).toEqual(['tags', ['health']]);
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['quality_status', 'approved']);
  });
});

describe('useSupportOrgs', () => {
  it('queries venues by category with default community_center + organization', async () => {
    withResults({ data: [{ id: 'v1', name: 'Org' }], error: null });
    const { result } = renderHook(() => useSupportOrgs(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.table).toBe('venues');
    const inCall = call.chain.find(s => s.method === 'in');
    expect(inCall?.args).toEqual(['category', ['community_center', 'organization']]);
  });

  it('accepts a custom category list', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useSupportOrgs(['shelter']), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const inCall = state.calls[0].chain.find(s => s.method === 'in');
    expect(inCall?.args).toEqual(['category', ['shelter']]);
  });

  it('surfaces query errors', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useSupportOrgs(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
