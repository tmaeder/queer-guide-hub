import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

import { searchTagsWithAliases } from '../useTagAliasSearch';

/** Rows as the RPC actually returns them: ordered by uuid, not by score. */
const UUID_ORDERED = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Bearded',
    slug: 'bearded',
    match_via: 'canonical',
    match_score: 0.21,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Bear',
    slug: 'bear',
    match_via: 'canonical',
    match_score: 0.98,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Bear Week',
    slug: 'bear-week',
    match_via: 'alias',
    match_score: 0.55,
  },
];

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: UUID_ORDERED, error: null });
});

describe('searchTagsWithAliases', () => {
  it('re-sorts by match_score — the RPC returns uuid order', () => {
    // DISTINCT ON (id) forces `ORDER BY id, match_score`, so the rows arrive
    // ordered by uuid and LIMIT truncates an arbitrary slice. Without this
    // client-side sort, "Bearded" (0.21) outranks the exact match "Bear".
    return searchTagsWithAliases('bear').then((hits) => {
      expect(hits.map((h) => h.name)).toEqual(['Bear', 'Bear Week', 'Bearded']);
    });
  });

  it('asks for the whole recall set, not a page', () => {
    // A small p_limit would truncate in uuid order BEFORE any ranking exists.
    return searchTagsWithAliases('bear').then(() => {
      expect(rpc).toHaveBeenCalledWith('search_tags_with_aliases', { q: 'bear', p_limit: 200 });
    });
  });

  it('does not call the RPC below the minimum query length', async () => {
    expect(await searchTagsWithAliases('b')).toEqual([]);
    expect(await searchTagsWithAliases('  ')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('trims the query before sending it', async () => {
    await searchTagsWithAliases('  bear  ');
    expect(rpc).toHaveBeenCalledWith('search_tags_with_aliases', { q: 'bear', p_limit: 200 });
  });

  it('returns [] rather than throwing when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await searchTagsWithAliases('bear')).toEqual([]);
  });

  it('tolerates a null match_score', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'a', name: 'A', slug: 'a', match_via: 'alias', match_score: null },
        { id: 'b', name: 'B', slug: 'b', match_via: 'canonical', match_score: 0.4 },
      ],
      error: null,
    });
    const hits = await searchTagsWithAliases('xy');
    expect(hits.map((h) => h.name)).toEqual(['B', 'A']);
  });
});
