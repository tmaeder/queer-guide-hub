import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

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
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      channel: () => new Proxy(() => {}, handler),
      removeChannel: vi.fn(),
    },
  };
});

import { useMailbox } from '../useMailbox';

describe('useMailbox', () => {
  it('should return expected shape', () => {
    const { result } = renderHook(() => useMailbox());
    expect(result.current).toHaveProperty('emails');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('selectedFolder');
    expect(typeof result.current.setSelectedFolder).toBe('function');
    expect(typeof result.current.sendEmail).toBe('function');
  });

  it('should start with inbox folder', () => {
    const { result } = renderHook(() => useMailbox());
    expect(result.current.selectedFolder).toBe('inbox');
  });

  it('should start with empty emails', () => {
    const { result } = renderHook(() => useMailbox());
    expect(result.current.emails).toEqual([]);
  });
});
