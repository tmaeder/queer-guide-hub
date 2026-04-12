import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockSelect = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: mockSelect,
        }),
      }),
    }),
  },
}));

import { useAccessibilityAttributes } from '../useAccessibilityAttributes';

describe('useAccessibilityAttributes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should start with empty array and fetch on mount', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: '1', name: 'Wheelchair' }], error: null });
    const { result } = renderHook(() => useAccessibilityAttributes());
    expect(result.current.accessibilityAttributes).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessibilityAttributes).toHaveLength(1);
  });

  it('should handle fetch error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: new Error('fail') });
    const { result } = renderHook(() => useAccessibilityAttributes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessibilityAttributes).toEqual([]);
  });
});
