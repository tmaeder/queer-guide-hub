import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockOrder } = vi.hoisted(() => ({
  mockOrder: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: mockOrder,
      }),
      insert: vi.fn().mockReturnValue({ select: () => ({ single: vi.fn() }) }),
      update: vi.fn().mockReturnValue({ eq: () => ({ select: () => ({ single: vi.fn() }) }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  },
}));

import { useAffiliateLinks } from '../useAffiliateLinks';

describe('useAffiliateLinks', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should fetch partners on mount', async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: '1', partner_name: 'Aviasales', domains: [], parameters: { marker: '123' }, enabled: true }],
      error: null,
    });
    const { result } = renderHook(() => useAffiliateLinks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.partners).toHaveLength(1);
    expect(result.current.partners[0].partner_name).toBe('Aviasales');
  });

  it('should set error on fetch failure', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('DB down') });
    const { result } = renderHook(() => useAffiliateLinks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('DB down');
  });

  it('should expose CRUD methods', () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useAffiliateLinks());
    expect(typeof result.current.createPartner).toBe('function');
    expect(typeof result.current.updatePartner).toBe('function');
    expect(typeof result.current.deletePartner).toBe('function');
  });
});
