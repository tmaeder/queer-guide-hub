import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockSelect = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: (...args: unknown[]) => {
        const chainable = {
          is: () => mockSelect(),
        };
        // If called with count options (head: true), call mockSelect directly
        if (args.length > 1) return { ...chainable, ...mockSelect() };
        return chainable;
      },
    }),
  },
}));

import { useConsolidatedStats } from '../useConsolidatedStats';

describe('useConsolidatedStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({ count: 42, error: null });
  });

  it('should start with default zero stats', () => {
    const { result } = renderHook(() => useConsolidatedStats());
    expect(result.current.stats.venues).toBe(0);
    expect(result.current.stats.profiles).toBe(0);
  });

  it('should start loading', () => {
    const { result } = renderHook(() => useConsolidatedStats());
    expect(result.current.loading).toBe(true);
  });

  it('should expose refetch function', () => {
    const { result } = renderHook(() => useConsolidatedStats());
    expect(typeof result.current.refetch).toBe('function');
  });
});
