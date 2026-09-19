import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

const eqCalls: [string, unknown][] = [];
const insertPayloads: unknown[] = [];

// createAlias takes alias_slug from normalize_tag_slug() over RPC rather than
// deriving it locally, so the untyped module has to be mocked too. Default is
// the value the live function returns for the fixture name; `rpcResult` lets a
// case make it fail.
let rpcResult: { data: string | null; error: { message: string } | null } = {
  data: 'found-family',
  error: null,
};
const rpcCalls: [string, unknown][] = [];
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (fn: string, args?: unknown) => {
    rpcCalls.push([fn, args]);
    return Promise.resolve(rpcResult);
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) =>
      p === 'then'
        ? undefined
        : (...a: unknown[]) => {
            if (p === 'eq') eqCalls.push([String(a[0]), a[1]]);
            if (p === 'insert') insertPayloads.push(a[0]);
            return new Proxy(() => {}, handler);
          },
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useTagAliases } from '../useTagAliases';

const w = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useTagAliases', () => {
  it('should return aliases array', () => {
    const { result } = renderHook(() => useTagAliases('tag-1'), { wrapper: w() });
    expect(result.current.aliases).toEqual([]);
    expect(result.current).toHaveProperty('isLoading');
  });

  it('should expose create and delete mutations', () => {
    const { result } = renderHook(() => useTagAliases('tag-1'), { wrapper: w() });
    expect(result.current.createAlias).toHaveProperty('mutate');
    expect(result.current.deleteAlias).toHaveProperty('mutate');
  });

  // The public glossary page must never display an unreviewed alias — the
  // auto pool is machine-minted from Wikidata sitelinks of a sometimes-wrong
  // entity, and auto-tagging/search already trust approved only.
  it('publicOnly filters to review_status=approved', async () => {
    eqCalls.length = 0;
    renderHook(() => useTagAliases('tag-1', { publicOnly: true }), { wrapper: w() });
    await vi.waitFor(() => {
      expect(eqCalls).toContainEqual(['review_status', 'approved']);
    });
  });

  it('default (admin) read does NOT filter by review_status', async () => {
    eqCalls.length = 0;
    renderHook(() => useTagAliases('tag-1'), { wrapper: w() });
    await vi.waitFor(() => {
      expect(eqCalls.some(([col]) => col === 'canonical_tag_id')).toBe(true);
    });
    expect(eqCalls.some(([col]) => col === 'review_status')).toBe(false);
  });

  it('admin-created aliases land approved (the admin IS the review)', async () => {
    insertPayloads.length = 0;
    rpcResult = { data: 'found-family', error: null };
    const { result } = renderHook(() => useTagAliases('tag-1'), { wrapper: w() });
    result.current.createAlias.mutate({ alias_name: 'Found family', alias_type: 'synonym' });
    await vi.waitFor(() => {
      expect(insertPayloads.length).toBeGreaterThan(0);
    });
    const rows = insertPayloads[0] as Array<Record<string, unknown>>;
    expect(rows[0].review_status).toBe('approved');
  });

  // alias_slug is NOT NULL with no default and no BEFORE trigger deriving it,
  // so the caller must supply one. It comes from normalize_tag_slug() so there
  // is a single implementation; the regex that used to live here STRIPPED
  // characters, turning an accented alias into 'caf-society'.
  it('alias_slug is whatever normalize_tag_slug returned', async () => {
    insertPayloads.length = 0;
    rpcCalls.length = 0;
    rpcResult = { data: 'cafe-society', error: null };
    const { result } = renderHook(() => useTagAliases('tag-1'), { wrapper: w() });
    result.current.createAlias.mutate({ alias_name: 'Café Society', alias_type: 'synonym' });
    await vi.waitFor(() => {
      expect(insertPayloads.length).toBeGreaterThan(0);
    });
    expect(rpcCalls[0]).toEqual(['normalize_tag_slug', { p_input: 'Café Society' }]);
    const rows = insertPayloads[0] as Array<Record<string, unknown>>;
    expect(rows[0].alias_slug).toBe('cafe-society');
    // The lossy value the deleted regex produced for this exact input.
    expect(rows[0].alias_slug).not.toBe('caf-society');
  });

  it('a failed normalize throws instead of inserting a locally-derived slug', async () => {
    insertPayloads.length = 0;
    rpcResult = { data: null, error: { message: 'boom' } };
    const { result } = renderHook(() => useTagAliases('tag-1'), { wrapper: w() });
    await expect(
      result.current.createAlias.mutateAsync({ alias_name: 'Café Society', alias_type: 'synonym' }),
    ).rejects.toThrow(/normalize/i);
    expect(insertPayloads).toHaveLength(0);
  });
});
