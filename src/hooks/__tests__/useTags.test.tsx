import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useTags } from '../useTags';

describe('useTags', () => {
  it('should start loading', () => {
    const { result } = renderHook(() => useTags());
    expect(result.current.loading).toBe(true);
  });

  it('should expose expected API', () => {
    const { result } = renderHook(() => useTags());
    expect(result.current).toHaveProperty('allTags');
    expect(result.current).toHaveProperty('tagsByCategory');
    expect(typeof result.current.searchTags).toBe('function');
    expect(typeof result.current.getTagDetails).toBe('function');
    expect(typeof result.current.refreshTags).toBe('function');
  });

  it('should start with empty tags', () => {
    const { result } = renderHook(() => useTags());
    expect(result.current.allTags).toEqual([]);
  });
});
