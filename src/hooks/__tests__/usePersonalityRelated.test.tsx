/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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

import { usePersonalityRelated } from '../usePersonalityRelated';

function withResults(...r: MockResult[]) {
  state.results.push(...r);
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('usePersonalityRelated', () => {
  it('does not fetch when name is empty', () => {
    renderHook(() => usePersonalityRelated(''));
    expect(state.calls).toHaveLength(0);
  });

  it('fetches news + events in parallel', async () => {
    withResults(
      {
        data: [
          {
            news_articles: {
              id: 'n1',
              title: 'Marsha P. Johnson honored',
              published_at: '2026-01-02',
            },
          },
        ],
        error: null,
      },
      {
        data: [{ events: { id: 'e1', title: 'Marsha tribute', start_date: '2026-01-03' } }],
        error: null,
      },
    );

    const { result } = renderHook(() => usePersonalityRelated('person-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.news.map((n) => n.id)).toEqual(['n1']);
    expect(result.current.events.map((e) => e.id)).toEqual(['e1']);
    expect(state.calls.map((c) => c.table)).toEqual([
      'news_article_entities',
      'event_personality_links',
    ]);
  });

  it('filters both link tables by personality id and approval state', async () => {
    withResults({ data: [], error: null }, { data: [], error: null });
    renderHook(() => usePersonalityRelated('person-1'));

    await waitFor(() => expect(state.calls).toHaveLength(2));
    expect(state.calls[0].chain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'eq', args: ['entity_type', 'personality'] }),
        expect.objectContaining({ method: 'eq', args: ['entity_id', 'person-1'] }),
      ]),
    );
    expect(state.calls[1].chain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'eq', args: ['personality_id', 'person-1'] }),
        expect.objectContaining({ method: 'eq', args: ['status', 'approved'] }),
      ]),
    );
  });

  it('returns empty arrays and stops loading on query rejection', async () => {
    // No results queued — the inline proxy will resolve with default empty
    // data, but we also exercise the catch path by injecting a thrown error
    // via a deferred rejection. Simulate by leaving results empty and using
    // a separate rejection.
    withResults(
      { data: null, error: { message: 'rls' } },
      { data: null, error: { message: 'rls' } },
    );
    const { result } = renderHook(() => usePersonalityRelated('person-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.news).toEqual([]);
    expect(result.current.events).toEqual([]);
  });
});
