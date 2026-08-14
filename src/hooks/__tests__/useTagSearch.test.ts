import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const searchTagsWithAliases = vi.fn();
vi.mock('@/hooks/useTagAliasSearch', () => ({
  searchTagsWithAliases: (...a: unknown[]) => searchTagsWithAliases(...a),
}));

import { useTagSearch } from '../useTagSearch';

beforeEach(() => {
  searchTagsWithAliases.mockReset();
  searchTagsWithAliases.mockResolvedValue([
    { id: '1', name: 'Bear', slug: 'bear', match_via: 'canonical', match_score: 0.9 },
    { id: '2', name: 'Non-binary', slug: 'non-binary', match_via: 'alias', match_score: 0.7 },
  ]);
});

describe('useTagSearch', () => {
  // The regression this exists for: the hook filtered on `unified_tags.is_active`,
  // a column that does not exist. PostgREST errored, `data` came back null, and
  // `null ?? []` made a hard failure look like "no matches" — so the /news
  // follow-a-tag picker returned nothing for its entire life, silently.
  it('actually returns rows', async () => {
    const { result } = renderHook(() => useTagSearch());
    await act(async () => {
      await result.current.search('bear');
    });
    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(result.current.results[0]).toEqual({ id: '1', name: 'Bear', slug: 'bear' });
  });

  it('goes through the alias-aware path, so a synonym resolves', async () => {
    const { result } = renderHook(() => useTagSearch());
    await act(async () => {
      await result.current.search('nb');
    });
    expect(searchTagsWithAliases).toHaveBeenCalledWith('nb');
    await waitFor(() => expect(result.current.results.map((r) => r.slug)).toContain('non-binary'));
  });

  it('short-circuits an empty query without a request', async () => {
    const { result } = renderHook(() => useTagSearch());
    await act(async () => {
      await result.current.search('   ');
    });
    expect(searchTagsWithAliases).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it('caps the picker list at 10', async () => {
    searchTagsWithAliases.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `T${i}`, slug: `t${i}` })),
    );
    const { result } = renderHook(() => useTagSearch());
    await act(async () => {
      await result.current.search('t');
    });
    await waitFor(() => expect(result.current.results).toHaveLength(10));
  });

  it('clear() empties the list', async () => {
    const { result } = renderHook(() => useTagSearch());
    await act(async () => {
      await result.current.search('bear');
    });
    await waitFor(() => expect(result.current.results).toHaveLength(2));
    act(() => result.current.clear());
    expect(result.current.results).toEqual([]);
  });
});
