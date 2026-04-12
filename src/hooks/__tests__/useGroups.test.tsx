import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

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
      functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
    },
  };
});

import { useGroups } from '../useGroups';

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useGroups', () => {
  it('should return groups hook with expected shape', () => {
    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty('groups');
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.createGroup).toBe('function');
    expect(typeof result.current.joinGroup).toBe('function');
    expect(typeof result.current.leaveGroup).toBe('function');
  });
});
