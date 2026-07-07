import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return {
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      channel: () => new Proxy(() => {}, handler),
      removeChannel: vi.fn(),
    },
  };
});

import { useInboxFeed } from '../useInboxFeed';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
};

describe('useInboxFeed', () => {
  it('returns the expected shape', () => {
    const { result } = renderHook(() => useInboxFeed('all'), { wrapper });
    expect(result.current).toHaveProperty('items');
    expect(Array.isArray(result.current.items)).toBe(true);
    expect(result.current).toHaveProperty('unreadCount');
    expect(typeof result.current.loading).toBe('boolean');
    expect(typeof result.current.fetchNextPage).toBe('function');
  });

  it("accepts the 'groups' filter (group chat lens over get_inbox_feed)", () => {
    const { result } = renderHook(() => useInboxFeed('groups'), { wrapper });
    expect(result.current).toHaveProperty('items');
    expect(Array.isArray(result.current.items)).toBe(true);
  });
});
