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

import { usePersonalitiesByProfession } from '../usePageFetchers';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

async function chainFor(profession?: string) {
  state.results.push({ data: [], error: null });
  const { result } = renderHook(() => usePersonalitiesByProfession(profession), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return state.calls[0].chain;
}

/**
 * Regression guards for a page that was publishing rows it should not have.
 * Measured on prod 2026-08-14, before the fix:
 *   - /professions/drag queen rendered 25 DRAFT rows out of 52
 *   - /professions/adult performer rendered 571 drafts and 574 adult performers
 *   - 171 profession pages carried non-public rows
 * RLS does not contain this — the anon key can read 14,448 draft personalities
 * — so every one of these predicates has to be written explicitly.
 */
describe('usePersonalitiesByProfession — query shape', () => {
  it('only ever asks for public rows', async () => {
    const chain = await chainFor('writer');
    expect(chain.filter((s) => s.method === 'eq')).toContainEqual({
      method: 'eq',
      args: ['visibility', 'public'],
    });
  });

  it('excludes adult performers, which this surface has no toggle to opt into', async () => {
    const chain = await chainFor('writer');
    expect(chain.filter((s) => s.method === 'eq')).toContainEqual({
      method: 'eq',
      args: ['is_adult', false],
    });
  });

  it('narrows by profession server-side so the 1000-row cap cannot truncate it', async () => {
    // PostgREST hard-caps at 1000 regardless of `limit` (verified against prod:
    // limit=1500 and limit=5000 both return exactly 1000). Fetching the whole
    // table and matching client-side saw 1,000 of 12,169 rows ordered by name,
    // so professions late in the alphabet silently lost people. Even
    // visibility=public alone is 1,612 rows — still over the cap.
    const chain = await chainFor('drag queen');
    expect(chain.filter((s) => s.method === 'ilike')).toContainEqual({
      method: 'ilike',
      args: ['profession', '%drag queen%'],
    });
  });

  it('still returns everything when no profession is given', async () => {
    // The caller may render before the route param resolves; that must not
    // become an unfiltered-by-profession query that also drops the guards.
    const chain = await chainFor(undefined);
    expect(chain.some((s) => s.method === 'ilike')).toBe(false);
    expect(chain.filter((s) => s.method === 'eq')).toContainEqual({
      method: 'eq',
      args: ['visibility', 'public'],
    });
    expect(chain.filter((s) => s.method === 'eq')).toContainEqual({
      method: 'eq',
      args: ['is_adult', false],
    });
  });

  it('keeps the duplicate and null-profession exclusions it already had', async () => {
    const chain = await chainFor('writer');
    expect(chain.filter((s) => s.method === 'is')).toContainEqual({
      method: 'is',
      args: ['duplicate_of_id', null],
    });
    expect(chain.filter((s) => s.method === 'not')).toContainEqual({
      method: 'not',
      args: ['profession', 'is', null],
    });
  });
});
