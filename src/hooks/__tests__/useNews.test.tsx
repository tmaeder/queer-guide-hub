import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      return (..._a: unknown[]) => new Proxy(() => {}, handler);
    },
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useNews } from '../useNews';

describe('useNews', () => {
  it('should start with empty state', () => {
    const { result } = renderHook(() => useNews());
    expect(result.current.articles).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('should expose fetch methods', () => {
    const { result } = renderHook(() => useNews());
    expect(typeof result.current.fetchArticles).toBe('function');
    expect(typeof result.current.refreshData).toBe('function');
  });
});
