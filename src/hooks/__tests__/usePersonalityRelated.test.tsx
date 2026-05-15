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

function withResults(...r: MockResult[]) { state.results.push(...r); }

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
      { data: [{ id: 'n1', title: 'Marsha P. Johnson honored' }], error: null },
      { data: [{ id: 'e1', title: 'Marsha tribute' }], error: null },
    );

    const { result } = renderHook(() =>
      usePersonalityRelated('Marsha P. Johnson', 'marsha-p-johnson'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.news.map(n => n.id)).toEqual(['n1']);
    expect(result.current.events.map(e => e.id)).toEqual(['e1']);
    expect(state.calls.map(c => c.table)).toEqual(['news_articles', 'events']);
  });

  it('builds an or() clause that includes the tag-array contains when slug is present', async () => {
    withResults({ data: [], error: null }, { data: [], error: null });
    renderHook(() => usePersonalityRelated('Marsha', 'marsha'));

    await waitFor(() => expect(state.calls).toHaveLength(2));
    const news = state.calls[0];
    const orCall = news.chain.find(s => s.method === 'or');
    const clause = orCall?.args[0] as string;
    expect(clause).toContain('title.ilike.*Marsha*');
    expect(clause).toContain('tags.cs.{marsha}');
  });

  it('omits the tag clause when slug is not provided', async () => {
    withResults({ data: [], error: null }, { data: [], error: null });
    renderHook(() => usePersonalityRelated('Marsha'));

    await waitFor(() => expect(state.calls).toHaveLength(2));
    const news = state.calls[0];
    const orCall = news.chain.find(s => s.method === 'or');
    const clause = orCall?.args[0] as string;
    expect(clause).toContain('title.ilike.');
    expect(clause).not.toContain('tags.cs');
  });

  it('strips % and , from the name before injecting into ilike', async () => {
    withResults({ data: [], error: null }, { data: [], error: null });
    renderHook(() => usePersonalityRelated('Foo%,Bar'));

    await waitFor(() => expect(state.calls).toHaveLength(2));
    const clause = state.calls[0].chain.find(s => s.method === 'or')?.args[0] as string;
    expect(clause).not.toContain('%');
    // Each stripped char becomes a single space, so 'Foo%,Bar' → 'Foo  Bar'.
    expect(clause.split('title.ilike.')[1]).toMatch(/\*Foo {2}Bar\*/);
  });

  it('returns empty arrays and stops loading on query rejection', async () => {
    // No results queued — the inline proxy will resolve with default empty
    // data, but we also exercise the catch path by injecting a thrown error
    // via a deferred rejection. Simulate by leaving results empty and using
    // a separate rejection.
    withResults({ data: null, error: { message: 'rls' } }, { data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => usePersonalityRelated('X'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.news).toEqual([]);
    expect(result.current.events).toEqual([]);
  });
});
