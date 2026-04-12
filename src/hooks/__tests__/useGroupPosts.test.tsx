import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      return (..._a: unknown[]) => new Proxy(() => {}, handler);
    },
    apply: () => new Proxy(() => {}, handler),
  };
  return {
    supabase: {
      from: () => new Proxy(() => {}, handler),
      channel: () => new Proxy(() => {}, handler),
      removeChannel: vi.fn(),
    },
  };
});

import { useGroupPosts } from '../useGroupPosts';

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useGroupPosts', () => {
  it('should return expected shape', () => {
    const { result } = renderHook(() => useGroupPosts('group-1'), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty('posts');
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.createPost).toBe('function');
    expect(typeof result.current.likePost).toBe('function');
    expect(typeof result.current.togglePin).toBe('function');
  });

  it('should start with empty posts', () => {
    const { result } = renderHook(() => useGroupPosts('group-1'), { wrapper: makeWrapper() });
    expect(result.current.posts).toEqual([]);
  });
});
