import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  // The hook uses rpc() in BOTH shapes the real client supports:
  //   rpc('get_my_profile').maybeSingle()        — chained on the builder
  //   await rpc('check_mailbox_availability', …) — awaited directly
  // A plain mockResolvedValue only covers the second and makes the first throw
  // `maybeSingle is not a function` inside an effect, which surfaces as an
  // unhandled rejection rather than a failing test. So the mock returns a value
  // that is thenable AND carries maybeSingle, like the builder does.
  const rpcResult = {
    data: { available: true, reason: null },
    error: null,
    maybeSingle: () => Promise.resolve({ data: { mailbox_address: null }, error: null }),
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: { available: true, reason: null }, error: null }).then(onFulfilled),
  };
  return { supabase: { from: () => new Proxy(() => {}, h), rpc: vi.fn(() => rpcResult) } };
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
