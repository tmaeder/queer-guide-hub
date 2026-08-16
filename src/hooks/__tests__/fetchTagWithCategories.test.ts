/**
 * @vitest-environment jsdom
 *
 * The SPA half of the merged-tag soft-404 fix (the edge half is guarded by
 * functions/_lib/tagRedirect.test.ts).
 *
 * `fetchTagWithCategories` filters `status = 'active'` on both of its lookups,
 * which is correct — but it meant a merged tag resolved to null and TagDetail
 * rendered "No such term" for a concept that still exists under another slug.
 * `resolve_tag_slug()` is the resolver that already handles this; it had been
 * anon-granted since 2026-08-02 with no caller anywhere in the app.
 *
 * What matters here is not just "it follows the redirect" but the ORDER: a live
 * tag must never be pre-empted by a redirect row. 10 old_slugs in
 * tag_slug_redirects are also the slug of an active tag today, so getting this
 * backwards would silently bounce 10 working pages somewhere else.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Row = Record<string, unknown> | null;

const { tagRows, rpcMock, fromSpy } = vi.hoisted(() => ({
  tagRows: new Map<string, Row>(),
  rpcMock: vi.fn(),
  fromSpy: vi.fn(),
}));

/**
 * Minimal PostgREST-ish builder. `unified_tags` answers from `tagRows` keyed by
 * the requested slug and honours `.eq('status','active')`; the auxiliary tables
 * the function also touches resolve to empty.
 */
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      ilike: (col: string, val: unknown) => {
        filters[`ilike:${col}`] = val;
        return chain;
      },
      in: () => Promise.resolve({ data: [], error: null }),
      order: () => Promise.resolve({ data: [], error: null }),
      limit: () => chain,
      maybeSingle: () => {
        if (table !== 'unified_tags') return Promise.resolve({ data: null, error: null });
        if (filters.status !== 'active') return Promise.resolve({ data: null, error: null });
        const slug = filters.slug as string | undefined;
        const row = slug ? (tagRows.get(slug) ?? null) : null;
        return Promise.resolve({ data: row, error: null });
      },
      then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r),
    };
    fromSpy(table);
    return chain;
  };
  return { supabase: { from: builder, rpc: rpcMock } };
});

import { fetchTagWithCategories } from '../usePageFetchers';

const CANONICAL = { id: 'canon-1', slug: 'risk-aware-consensual-kink', name: 'RACK' };
const LIVE = { id: 'live-1', slug: 'bear-bar', name: 'Bear Bar' };

beforeEach(() => {
  tagRows.clear();
  fromSpy.mockClear();
  // Default: nothing resolves. Individual tests opt in.
  rpcMock.mockReset();
  rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
});

describe('fetchTagWithCategories — merged tag resolution', () => {
  it('follows a merged slug to its canonical tag', async () => {
    tagRows.set('risk-aware-consensual-kink', CANONICAL);
    rpcMock.mockReturnValue({
      maybeSingle: () =>
        Promise.resolve({
          data: { id: 'canon-1', slug: 'risk-aware-consensual-kink', redirected: true },
          error: null,
        }),
    });

    const tag = await fetchTagWithCategories('rack');

    expect(tag).toMatchObject({ slug: 'risk-aware-consensual-kink' });
    expect(rpcMock).toHaveBeenCalledWith('resolve_tag_slug', { p_slug: 'rack' });
  });

  it('does not consult the redirect table when the slug is a live tag', async () => {
    tagRows.set('bear-bar', LIVE);

    const tag = await fetchTagWithCategories('bear-bar');

    expect(tag).toMatchObject({ slug: 'bear-bar' });
    // 10 redirect old_slugs are also live tag slugs on prod. A direct hit wins,
    // and the extra round trip is never paid on the happy path.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns null when the resolver finds nothing (retired concept → 404)', async () => {
    const tag = await fetchTagWithCategories('harm-reduction-practices');

    expect(tag).toBeNull();
    expect(rpcMock).toHaveBeenCalled();
  });

  it('returns null rather than looping when the resolver echoes the input slug', async () => {
    rpcMock.mockReturnValue({
      maybeSingle: () =>
        Promise.resolve({ data: { id: 'x', slug: 'rack', redirected: false }, error: null }),
    });

    await expect(fetchTagWithCategories('rack')).resolves.toBeNull();
  });

  it('lowercases the slug it asks the resolver about', async () => {
    await fetchTagWithCategories('Crystal-Meth');
    expect(rpcMock).toHaveBeenCalledWith('resolve_tag_slug', { p_slug: 'crystal-meth' });
  });
});
