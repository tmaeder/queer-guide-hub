import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockOrder = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: mockOrder,
        }),
      }),
    }),
  },
}));

import { useTargetGroups } from '../useTargetGroups';

describe('useTargetGroups', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should fetch target groups on mount', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: '1', name: 'LGBTQ+' }], error: null });
    const { result } = renderHook(() => useTargetGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targetGroups).toHaveLength(1);
  });

  it('should handle error gracefully', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('fail') });
    const { result } = renderHook(() => useTargetGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targetGroups).toEqual([]);
  });
});
