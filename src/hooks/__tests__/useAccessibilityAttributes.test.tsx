import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockOrder = vi.fn();
const mockFrom = vi.fn();
const mockEq = vi.fn();

// Chainable builder. The hook applies TWO .eq() filters, and a mock that allows
// exactly one silently breaks the chain: the resulting TypeError lands in the
// hook's own catch, so it just reports an empty list -- indistinguishable from
// "the table is empty", which is why the error-path test below kept passing
// while the hook under it was unreachable.
vi.mock('@/integrations/supabase/client', () => {
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      mockEq(col, val);
      return builder;
    },
    order: (...args: unknown[]) => mockOrder(...args),
  };
  return {
    supabase: {
      from: (table: string) => {
        mockFrom(table);
        return builder;
      },
    },
  };
});

import { useAccessibilityAttributes } from '../useAccessibilityAttributes';

describe('useAccessibilityAttributes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with empty array and fetch on mount', async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: '1', slug: 'wheelchair-accessible', name: 'Wheelchair' }],
      error: null,
    });
    const { result } = renderHook(() => useAccessibilityAttributes());
    expect(result.current.accessibilityAttributes).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessibilityAttributes).toHaveLength(1);
  });

  // The table and both filters ARE the point of this hook: `amenities` rows carry
  // the slugs that events/venues actually store, while the similarly-named
  // `accessibility_attributes` table holds display names that can never match a
  // row. Without these assertions the suite passes just as happily against the
  // wrong table.
  it('reads active accessibility amenities', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useAccessibilityAttributes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('amenities');
    expect(mockEq).toHaveBeenCalledWith('kind', 'accessibility');
    expect(mockEq).toHaveBeenCalledWith('is_active', true);
  });

  it('should handle fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('fail') });
    const { result } = renderHook(() => useAccessibilityAttributes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessibilityAttributes).toEqual([]);
  });
});
