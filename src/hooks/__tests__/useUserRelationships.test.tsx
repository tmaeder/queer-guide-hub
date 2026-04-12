import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return {
    supabase: {
      from: () => new Proxy(() => {}, handler),
    },
  };
});

import { useUserRelationships } from '../useUserRelationships';

describe('useUserRelationships', () => {
  it('should return expected shape', () => {
    const { result } = renderHook(() => useUserRelationships());
    expect(result.current).toHaveProperty('relationships');
    expect(result.current).toHaveProperty('loading');
    expect(typeof result.current.addFriend).toBe('function');
    expect(typeof result.current.blockUser).toBe('function');
    expect(typeof result.current.getRelationshipStatus).toBe('function');
    expect(typeof result.current.getFriends).toBe('function');
  });

  it('should start with empty relationships', () => {
    const { result } = renderHook(() => useUserRelationships());
    expect(result.current.relationships).toEqual([]);
  });
});
