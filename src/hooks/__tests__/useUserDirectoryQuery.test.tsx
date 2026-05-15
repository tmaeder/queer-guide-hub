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

import {
  useUserDirectoryQuery,
  defaultUserFilters,
  ageRanges,
  relationshipStatuses,
  educationLevels,
  genderIdentities,
  commonInterests,
} from '../useUserDirectoryQuery';

function withResults(...r: MockResult[]) { state.results.push(...r); }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('Static constants', () => {
  it('defaultUserFilters has expected shape', () => {
    expect(defaultUserFilters.sortBy).toBe('newest');
    expect(defaultUserFilters.ageRange).toBe('all');
    expect(defaultUserFilters.interests).toEqual([]);
  });

  it('exposes pickable lists', () => {
    expect(ageRanges.length).toBeGreaterThan(0);
    expect(relationshipStatuses.length).toBeGreaterThan(0);
    expect(educationLevels.length).toBeGreaterThan(0);
    expect(genderIdentities).toContain('Non-binary');
    expect(commonInterests).toContain('Travel');
  });
});

describe('useUserDirectoryQuery', () => {
  function run(overrides: Partial<typeof defaultUserFilters> = {}, opts?: { nearMe?: boolean; userLocation?: { latitude: number; longitude: number } | null }) {
    return renderHook(
      () =>
        useUserDirectoryQuery({
          filters: { ...defaultUserFilters, ...overrides },
          nearMe: opts?.nearMe ?? false,
          userLocation: opts?.userLocation ?? null,
          enabled: true,
        }),
      { wrapper },
    );
  }

  it('queries profiles table when enabled', async () => {
    withResults({ data: [{ user_id: 'u1', display_name: 'Alice' }], error: null });
    const { result } = run();
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0].display_name).toBe('Alice');
    expect(state.calls[0].table).toBe('profiles');
  });

  it('applies search via .or across display_name/bio/location', async () => {
    withResults({ data: [], error: null });
    run({ searchQuery: 'alice' });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const orCall = state.calls[0].chain.find(s => s.method === 'or');
    const clause = orCall?.args[0] as string;
    expect(clause).toContain('display_name.ilike.%alice%');
    expect(clause).toContain('bio.ilike.%alice%');
    expect(clause).toContain('location.ilike.%alice%');
  });

  it("ignores 'all' sentinels for ageRange/education/gender/relationship", async () => {
    withResults({ data: [], error: null });
    run({ ageRange: 'all', education: 'all', genderIdentity: 'all', relationshipStatus: 'all' });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq');
    const cols = eqs.map(e => (e.args as [string, unknown])[0]);
    expect(cols).not.toContain('age_range');
    expect(cols).not.toContain('education');
    expect(cols).not.toContain('gender_identity');
    expect(cols).not.toContain('relationship_status');
  });

  it('applies boolean filters only when truthy', async () => {
    withResults({ data: [], error: null });
    run({ isBusiness: true, hasChildren: true, hasPets: false, isVerified: true });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq');
    const cols = eqs.map(e => (e.args as [string, unknown])[0]);
    expect(cols).toContain('is_business');
    expect(cols).toContain('has_children');
    expect(cols).toContain('verified_identity');
    expect(cols).not.toContain('has_pets');
  });

  it.each([
    ['newest', 'created_at', false],
    ['oldest', 'created_at', true],
    ['alphabetical', 'display_name', true],
    ['last_active', 'last_active_at', false],
  ] as const)('sorts by %s → order(%s, ascending=%s)', async (sortBy, col, asc) => {
    withResults({ data: [], error: null });
    run({ sortBy });
    await waitFor(() => expect(state.calls).toHaveLength(1));
    const order = state.calls[0].chain.find(s => s.method === 'order');
    expect(order?.args[0]).toBe(col);
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(asc);
  });

  it('post-filters by interests (case-insensitive substring)', async () => {
    withResults({
      data: [
        { user_id: 'u1', interests: ['Travel', 'Music'] },
        { user_id: 'u2', interests: ['Cooking'] },
        { user_id: 'u3', interests: null },
      ],
      error: null,
    });
    const { result } = run({ interests: ['travel'] });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map(p => p.user_id)).toEqual(['u1']);
  });

  it('throws a wrapped error when the query fails', async () => {
    // The hook configures retry: 2 with 1s delay, so we feed three failures
    // and bump waitFor timeout to outlast the retry window.
    withResults(
      { data: null, error: { message: 'rls' } },
      { data: null, error: { message: 'rls' } },
      { data: null, error: { message: 'rls' } },
    );
    const { result } = run();
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 8000 });
    expect((result.current.error as Error).message).toMatch(/Failed to load profiles/);
  }, 10000);
});
