import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h), rpc: vi.fn().mockResolvedValue({ data: { available: true, reason: null }, error: null }) } };
});

import { useMailboxAddress } from '../useMailboxAddress';

describe('useMailboxAddress', () => {
  it('should expose expected API', () => {
    const { result } = renderHook(() => useMailboxAddress());
    expect(typeof result.current.checkAvailability).toBe('function');
    expect(typeof result.current.claimAddress).toBe('function');
    expect(result.current).toHaveProperty('currentAddress');
    expect(result.current).toHaveProperty('fullEmail');
    expect(result.current).toHaveProperty('loading');
  });
});
