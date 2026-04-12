import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useTagAliases } from '../useTagAliases';

const w = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
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
});
