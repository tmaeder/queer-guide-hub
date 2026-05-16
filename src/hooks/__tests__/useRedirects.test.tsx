/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };
const { state, useAuthMock } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
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
              const next = state.results.shift() ?? { data: [], error: null, count: 0 };
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
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import { useRedirects } from '../useRedirects';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('useRedirects — fetchRedirects', () => {
  it('applies type/is_enabled/status_code/search filters + order + range', async () => {
    withResults({ data: [{ id: 'r1' }], error: null, count: 1 });

    const { result } = renderHook(() => useRedirects());
    await act(async () => {
      await result.current.fetchRedirects(
        { type: 'SHORT', is_enabled: true, status_code: 301, search: 'foo' },
        0,
        10,
        'updated_at',
        'desc',
      );
    });

    expect(result.current.total).toBe(1);
    const call = state.calls[0];
    const eqs = call.chain.filter(s => s.method === 'eq').map(e => e.args[0]);
    expect(eqs).toEqual(expect.arrayContaining(['type', 'is_enabled', 'status_code']));

    const or = call.chain.find(s => s.method === 'or');
    expect(or?.args[0]).toContain('slug.ilike.%foo%');
    expect(call.chain.find(s => s.method === 'range')?.args).toEqual([0, 9]);
  });

  it('captures error on supabase failure', async () => {
    withResults({ data: null, error: { message: 'rls denied' } });
    const { result } = renderHook(() => useRedirects());
    await act(async () => {
      await result.current.fetchRedirects();
    });
    // Hook's catch block only unwraps Error instances; plain objects fall
    // through to the fallback string.
    await waitFor(() => expect(result.current.error).toBe('Failed to fetch redirects'));
  });
});

describe('useRedirects — createRedirect', () => {
  it('inserts with preserve_query derived from query_mode and created_by from user', async () => {
    withResults({ data: { id: 'r-new' }, error: null });

    const { result } = renderHook(() => useRedirects());
    let created!: unknown;
    await act(async () => {
      created = await result.current.createRedirect({
        type: 'SHORT', slug: 'foo', match_kind: 'EXACT', target: '/x',
        status_code: 301, is_enabled: true, query_mode: 'PRESERVE',
      });
    });
    expect((created as { id: string }).id).toBe('r-new');

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload.preserve_query).toBe(true);
    expect(payload.created_by).toBe('u1');
  });

  it('returns null + sets error on supabase failure', async () => {
    withResults({ data: null, error: { message: 'unique constraint' } });

    const { result } = renderHook(() => useRedirects());
    let created: unknown;
    await act(async () => {
      created = await result.current.createRedirect({
        type: 'PATH', source_path: '/x', match_kind: 'EXACT', target: '/y',
        status_code: 301, is_enabled: true, query_mode: 'DROP',
      });
    });
    expect(created).toBeNull();
    expect(result.current.error).toBe('Failed to create redirect');
  });
});

describe('useRedirects — updateRedirect', () => {
  it('derives preserve_query from query_mode change', async () => {
    withResults({ data: { id: 'r1' }, error: null });

    const { result } = renderHook(() => useRedirects());
    await act(async () => {
      await result.current.updateRedirect('r1', { query_mode: 'DROP' });
    });

    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect((update?.args[0] as Record<string, unknown>).preserve_query).toBe(false);
  });

  it("doesn't add preserve_query when query_mode not in patch", async () => {
    withResults({ data: { id: 'r1' }, error: null });

    const { result } = renderHook(() => useRedirects());
    await act(async () => {
      await result.current.updateRedirect('r1', { is_enabled: false });
    });

    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect((update?.args[0] as Record<string, unknown>).preserve_query).toBeUndefined();
  });
});

describe('useRedirects — deleteRedirect + toggleEnabled', () => {
  it('deleteRedirect returns true on success', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useRedirects());
    let ok = false;
    await act(async () => {
      ok = await result.current.deleteRedirect('r1');
    });
    expect(ok).toBe(true);
  });

  it('deleteRedirect returns false on error + sets error', async () => {
    withResults({ data: null, error: { message: 'fk' } });
    const { result } = renderHook(() => useRedirects());
    let ok = true;
    await act(async () => {
      ok = await result.current.deleteRedirect('r1');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('Failed to delete redirect');
  });

  it('toggleEnabled updates is_enabled by id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useRedirects());
    await act(async () => {
      await result.current.toggleEnabled('r1', true);
    });
    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ is_enabled: true });
  });
});

describe('useRedirects — fetchEvents', () => {
  it('queries redirect_events filtered to redirect_id ordered desc with limit', async () => {
    withResults({ data: [{ id: 1 }], error: null });
    const { result } = renderHook(() => useRedirects());
    let events: unknown;
    await act(async () => {
      events = await result.current.fetchEvents('r1', 5);
    });
    expect(Array.isArray(events)).toBe(true);

    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['redirect_id', 'r1']);
    expect(state.calls[0].chain.find(s => s.method === 'limit')?.args).toEqual([5]);
  });

  it('returns [] on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useRedirects());
    let events: unknown;
    await act(async () => {
      events = await result.current.fetchEvents('r1');
    });
    expect(events).toEqual([]);
  });
});

describe('useRedirects — bulkImport', () => {
  it('aggregates success + per-row error message; defaults type from slug presence', async () => {
    withResults(
      { data: null, error: null },                           // row 1: success (SHORT inferred)
      { data: null, error: { message: 'duplicate' } },       // row 2: per-row error
      { data: null, error: null },                           // row 3: success (PATH inferred)
    );

    const { result } = renderHook(() => useRedirects());
    let outcome: { success: number; errors: string[] } | undefined;
    await act(async () => {
      outcome = await result.current.bulkImport([
        { slug: 'first', target: '/x' },
        { slug: 'second', target: '/y' },
        { source_path: '/old', target: '/new' },
      ]);
    });

    expect(outcome?.success).toBe(2);
    expect(outcome?.errors[0]).toMatch(/Row 2: duplicate/);

    // Row 1 → SHORT, slug.toLowerCase().trim()
    const r1 = state.calls[0].chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(r1.type).toBe('SHORT');
    expect(r1.slug).toBe('first');
    expect(r1.source_path).toBeNull();
    expect(r1.status_code).toBe(301);

    // Row 3 → PATH inferred (no slug)
    const r3 = state.calls[2].chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(r3.type).toBe('PATH');
    expect(r3.slug).toBeNull();
    expect(r3.source_path).toBe('/old');
  });
});

describe('useRedirects — exportAll', () => {
  it('returns the full list ordered by updated_at desc', async () => {
    withResults({ data: [{ id: 'r1' }, { id: 'r2' }], error: null });
    const { result } = renderHook(() => useRedirects());
    let out: unknown;
    await act(async () => {
      out = await result.current.exportAll();
    });
    expect((out as { id: string }[]).map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useRedirects());
    await expect(result.current.exportAll()).rejects.toEqual({ message: 'rls' });
  });
});
