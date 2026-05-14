import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// useSearch calls the Meilisearch proxy directly via `fetch`. Mock the global
// so tests don't hit the live worker (was mocking @/utils/fetchWithRetry which
// the hook no longer uses — every deploy failed on stale expectations).
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { useSearch, sanitiseHits } from '../useSearch';

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('useSearch', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('should start with empty results', () => {
    const { result } = renderHook(() => useSearch(''));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should return results after debounce', async () => {
    const hits = [{ objectID: '1', title: 'Bar', type: 'venue' }];
    mockFetch.mockResolvedValue(okJson({ hits, suggestions: [] }));
    const { result } = renderHook(() => useSearch('bar'));
    await waitFor(() => expect(result.current.results).toHaveLength(1), { timeout: 2000 });
  });

  it('should handle search error gracefully', async () => {
    // Hook retries 3× with exponential backoff (1s/2s/4s). Fail every attempt
    // so we hit the error branch promptly.
    mockFetch.mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useSearch('fail'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10000 });
    expect(result.current.results).toEqual([]);
  }, 15000);

  it('should not search for empty query', () => {
    renderHook(() => useSearch(''));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should expose performSearch', () => {
    const { result } = renderHook(() => useSearch(''));
    expect(typeof result.current.performSearch).toBe('function');
  });

  it('should return suggestions', async () => {
    const suggestions = [{ objectID: '2', title: 'Suggested', type: 'event' }];
    mockFetch.mockResolvedValue(okJson({ hits: [], suggestions }));
    const { result } = renderHook(() => useSearch('test'));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1), { timeout: 2000 });
  });

  // P2-8: queries shorter than MIN_QUERY_LEN must not hit the network.
  it('does not call fetch for single-character queries and exposes tooShort', async () => {
    const { result } = renderHook(() => useSearch('a'));
    await waitFor(() => expect(result.current.tooShort).toBe(true), { timeout: 1000 });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  // P0-1 / P0-3 / P1-5: post-process worker hits before exposing them.
  it('drops blank-title hits, dedupes by objectID, post-filters by category, sanitises facets', async () => {
    const hits = [
      { objectID: '1', title: 'Bar Berlin', type: 'venue', category: 'Bar' },
      { objectID: '1', title: 'Bar Berlin (dup)', type: 'venue', category: 'Bar' },
      { objectID: '2', title: '', type: 'venue', category: 'Bar' }, // blank → drop
      { objectID: '3', title: 'Restaurant', type: 'venue', category: 'Restaurant' }, // wrong cat → drop
    ];
    mockFetch.mockResolvedValue(
      okJson({
        hits,
        suggestions: [],
        totalHits: 4,
        facetDistribution: {
          category: { Bar: 2, undefined: 5, '': 3 },
        },
      }),
    );
    const { result } = renderHook(() => useSearch('berlin', { categories: ['Bar'] }));
    await waitFor(() => expect(result.current.results).toHaveLength(1), { timeout: 2000 });
    expect(result.current.results[0].objectID).toBe('1');
    // facet keys must never include literal "undefined" or "" — they collapse to "Other".
    const cats = result.current.facets.category || {};
    expect(Object.keys(cats)).not.toContain('undefined');
    expect(Object.keys(cats)).not.toContain('');
    expect(cats.Other).toBe(8);
  });

  // P0-3: UI-side type ids must be mapped to worker indexKeys before sending.
  it('maps UI type ids to worker indexKeys when calling the worker', async () => {
    mockFetch.mockResolvedValue(okJson({ hits: [], suggestions: [] }));
    renderHook(() => useSearch('berlin', { types: ['venue', 'personality'] }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 2000 });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.filters.types).toEqual(['venues', 'personalities']);
  });

  // P0-4: page param must be threaded into the request body.
  it('forwards 1-indexed page to the worker', async () => {
    mockFetch.mockResolvedValue(okJson({ hits: [], suggestions: [] }));
    renderHook(() => useSearch('berlin', {}, 3));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 2000 });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.page).toBe(3);
  });
});

describe('sanitiseHits', () => {
  it('returns [] for null/empty input', () => {
    expect(sanitiseHits(undefined, {})).toEqual([]);
    expect(sanitiseHits([], {})).toEqual([]);
  });

  it('drops hits without an objectID', () => {
    const hits = [{ objectID: '', title: 'X', type: 'venue' }];
    expect(sanitiseHits(hits as never, {})).toEqual([]);
  });
});
