import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

const eqCalls: [string, unknown][] = [];
const insertPayloads: unknown[] = [];

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
    const { result } = renderHook(() => useTagAliases('tag-1'), { wrapper: w() });
    result.current.createAlias.mutate({ alias_name: 'Found family', alias_type: 'synonym' });
    await vi.waitFor(() => {
      expect(insertPayloads.length).toBeGreaterThan(0);
    });
    const rows = insertPayloads[0] as Array<Record<string, unknown>>;
    expect(rows[0].review_status).toBe('approved');
  });
});
