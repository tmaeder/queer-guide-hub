import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// useSearch calls the Meilisearch proxy directly via `fetch`. Mock the global
// so tests don't hit the live worker (was mocking @/utils/fetchWithRetry which
// the hook no longer uses — every deploy failed on stale expectations).
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { useSearch } from '../useSearch';

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
});
