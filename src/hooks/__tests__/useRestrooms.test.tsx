import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import { useRestrooms } from '../useRestrooms';

describe('useRestrooms', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should start with empty state', () => {
    const { result } = renderHook(() => useRestrooms());
    expect(result.current.restrooms).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch restrooms successfully', async () => {
    const mockData = [{ id: 1, name: 'Test Restroom', latitude: 47.3, longitude: 8.5 }];
    mockInvoke.mockResolvedValue({ data: mockData, error: null });
    const { result } = renderHook(() => useRestrooms());
    await act(async () => {
      await result.current.fetchRestrooms({ lat: 47.3, lng: 8.5 });
    });
    expect(result.current.restrooms).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it('should handle error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Network error') });
    const { result } = renderHook(() => useRestrooms());
    await act(async () => {
      await result.current.fetchRestrooms();
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });

  it('should pass params to edge function', async () => {
    mockInvoke.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useRestrooms());
    await act(async () => {
      await result.current.fetchRestrooms({ lat: 40.7, lng: -74, page: 2, per_page: 50 });
    });
    expect(mockInvoke).toHaveBeenCalledWith('get-refuge-restrooms', {
      body: { lat: 40.7, lng: -74, page: 2, per_page: 50 },
    });
  });
});
