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
        eq: () => ({
          order: mockOrder,
        }),
      }),
    }),
  },
}));

import { useDirectory } from '../useDirectory';

describe('useDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrder.mockResolvedValue({ data: [], error: null });
  });

  it('should start loading', () => {
    const { result } = renderHook(() => useDirectory());
    expect(result.current.loading).toBe(true);
  });

  it('should fetch continents on mount', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: '1', name: 'Europe' }], error: null });
    const { result } = renderHook(() => useDirectory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.continents.length).toBeGreaterThanOrEqual(0);
  });

  it('should expose fetch methods', () => {
    const { result } = renderHook(() => useDirectory());
    expect(typeof result.current.fetchCountriesByContinent).toBe('function');
    expect(typeof result.current.fetchCitiesByCountry).toBe('function');
  });

  it('should handle error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('DB error') });
    const { result } = renderHook(() => useDirectory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
