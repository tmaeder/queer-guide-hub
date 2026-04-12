import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('@/utils/fetchWithRetry', () => ({
  invokeWithRetry: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

import { useSearch } from '../useSearch';

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with empty results', () => {
    const { result } = renderHook(() => useSearch(''));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should return results after debounce', async () => {
    const hits = [{ objectID: '1', title: 'Bar', type: 'venue' }];
    mockInvoke.mockResolvedValue({ data: { hits, suggestions: [] }, error: null });
    const { result } = renderHook(() => useSearch('bar'));
    await waitFor(() => expect(result.current.results).toHaveLength(1), { timeout: 2000 });
  });

  it('should handle search error gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useSearch('fail'));
    // Wait for debounce + error handling
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 2000 });
    expect(result.current.results).toEqual([]);
  });

  it('should not search for empty query', () => {
    renderHook(() => useSearch(''));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('should expose performSearch', () => {
    const { result } = renderHook(() => useSearch(''));
    expect(typeof result.current.performSearch).toBe('function');
  });

  it('should return suggestions', async () => {
    const suggestions = [{ objectID: '2', title: 'Suggested', type: 'event' }];
    mockInvoke.mockResolvedValue({ data: { hits: [], suggestions }, error: null });
    const { result } = renderHook(() => useSearch('test'));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1), { timeout: 2000 });
  });
});
