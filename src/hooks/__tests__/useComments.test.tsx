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
  const handler: ProxyHandler<any> = {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      return (..._a: any[]) => new Proxy(() => {}, handler);
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

import { useComments } from '../useComments';

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useComments', () => {
  it('should return expected shape', () => {
    const { result } = renderHook(() => useComments('post-123'), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty('comments');
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.createComment).toBe('function');
    expect(typeof result.current.deleteComment).toBe('function');
  });
});
