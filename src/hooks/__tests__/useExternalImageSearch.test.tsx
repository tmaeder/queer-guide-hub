import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { results: [] }, error: null }) } },
}));
import { useExternalImageSearch } from '../useExternalImageSearch';
describe('useExternalImageSearch', () => {
  it('should start with empty results', () => {
    const { result } = renderHook(() => useExternalImageSearch());
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
  it('should expose search functions', () => {
    const { result } = renderHook(() => useExternalImageSearch());
    expect(typeof result.current.searchPexelsUnsplash).toBe('function');
    expect(typeof result.current.searchWikipedia).toBe('function');
    expect(typeof result.current.clearResults).toBe('function');
  });
});
