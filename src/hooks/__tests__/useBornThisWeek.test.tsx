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

import { useBornThisWeek } from '../useBornThisWeek';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useBornThisWeek — query shape', () => {
  it("queries personalities by birth_date in 'born' mode", async () => {
    withResults({ data: [], error: null });
    const { result } = renderHook(() => useBornThisWeek(6, 'born'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const notNull = state.calls[0].chain.find(s => s.method === 'not');
    expect(notNull?.args[0]).toBe('birth_date');
    expect(state.calls[0].chain.find(s => s.method === 'limit')?.args).toEqual([500]);
  });

  it("queries by death_date in 'died' mode", async () => {
    withResults({ data: [], error: null });
    const { result } = renderHook(() => useBornThisWeek(6, 'died'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const notNull = state.calls[0].chain.find(s => s.method === 'not');
    expect(notNull?.args[0]).toBe('death_date');
  });
});

describe('useBornThisWeek — window filtering', () => {
  it('keeps personalities whose anniversary is today (always in window)', async () => {
    // Synthesize a birth date that matches today's month+day (any year).
    // Anniversary = today → diff=0 → always within ±3 days.
    const today = new Date();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    const todayAnniversary = `1980-${mm}-${dd}`;

    withResults({
      data: [
        { id: 'p-today', name: 'Today', birth_date: todayAnniversary, view_count: 10 },
        { id: 'p-far', name: 'Far away', birth_date: '1980-01-01', view_count: 9 },
      ],
      error: null,
    });

    const { result } = renderHook(() => useBornThisWeek(6, 'born'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // p-today should always be in window. p-far is outside unless today is
    // around Jan 1 — accept both possibilities by checking p-today is present.
    expect(result.current.items.some(p => p.id === 'p-today')).toBe(true);
  });

  it('drops rows with invalid date strings', async () => {
    withResults({
      data: [{ id: 'p1', birth_date: 'not-a-date', view_count: 10 }],
      error: null,
    });
    const { result } = renderHook(() => useBornThisWeek(6, 'born'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('returns [] on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useBornThisWeek(6, 'born'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });
});
