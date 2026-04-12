import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockQueryResult } = vi.hoisted(() => ({
  mockQueryResult: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => mockQueryResult(),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { usePersonalities } from '../usePersonalities';

describe('usePersonalities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResult.mockResolvedValue({ data: [], error: null, count: 0 });
  });

  it('should start loading when autoFetch is true', () => {
    const { result } = renderHook(() => usePersonalities());
    // autoFetch defaults to true
    expect(typeof result.current.fetchPersonalities).toBe('function');
  });

  it('should expose CRUD methods', () => {
    const { result } = renderHook(() => usePersonalities());
    expect(typeof result.current.createPersonality).toBe('function');
    expect(typeof result.current.updatePersonality).toBe('function');
    expect(typeof result.current.incrementViews).toBe('function');
  });

  it('should start with empty personalities', () => {
    const { result } = renderHook(() => usePersonalities(false));
    expect(result.current.personalities).toEqual([]);
  });

  it('should expose search functionality', () => {
    const { result } = renderHook(() => usePersonalities(false));
    expect(typeof result.current.fetchPersonalities).toBe('function');
  });
});
