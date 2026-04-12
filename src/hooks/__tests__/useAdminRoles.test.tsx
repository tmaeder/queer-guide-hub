import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useAdminRoles } from '../useAdminRoles';

describe('useAdminRoles', () => {
  it('should return false for isAdmin when no user', () => {
    const { result } = renderHook(() => useAdminRoles());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isModerator).toBe(false);
  });

  it('should expose hasRole and canManageContent', () => {
    const { result } = renderHook(() => useAdminRoles());
    expect(typeof result.current.hasRole).toBe('function');
    expect(typeof result.current.canManageContent).toBe('function');
  });

  it('should return false for canManageContent when no roles', () => {
    const { result } = renderHook(() => useAdminRoles());
    expect(result.current.canManageContent()).toBe(false);
  });
});
