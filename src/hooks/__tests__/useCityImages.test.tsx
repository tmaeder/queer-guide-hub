import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import { useCityImages } from '../useCityImages';

describe('useCityImages', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should start not loading with no error', () => {
    const { result } = renderHook(() => useCityImages());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps a flagged city image quarantined without an automatic request', async () => {
    const { result } = renderHook(() => useCityImages());
    let response: unknown;
    await act(async () => {
      response = await result.current.fetchCityImage('city-1', 'Cleves', 'Germany', {
        existing: { image_url: 'https://img.test/munich.jpg', image_flagged: true },
      });
    });
    expect(response).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('preserves curated imagery and permits an explicit refresh of quarantined imagery', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true, image_url: 'https://img.test/cleves.jpg' }, error: null });
    const { result } = renderHook(() => useCityImages());
    await act(async () => {
      const curated = await result.current.fetchCityImage('city-1', 'Cleves', 'Germany', {
        existing: { curated_image_url: 'https://img.test/curated.jpg', image_flagged: true },
      });
      expect(curated?.image_url).toBe('https://img.test/curated.jpg');
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.fetchCityImage('city-1', 'Cleves', 'Germany', {
        refresh: true, existing: { image_flagged: true },
      });
    });
    expect(mockInvoke).toHaveBeenCalledWith('fetch-images', expect.objectContaining({
      body: expect.objectContaining({ forceUpdate: true }),
    }));
  });

  it('should fetch city image successfully', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, image_url: 'https://img.test/z.jpg', cached: false },
      error: null,
    });
    const { result } = renderHook(() => useCityImages());
    let res: unknown;
    await act(async () => {
      res = await result.current.fetchCityImage('city-1', 'Zurich', 'Switzerland');
    });
    expect(res?.image_url).toBe('https://img.test/z.jpg');
    expect(result.current.loading).toBe(false);
  });

  it('should set error on function failure', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Rate limit' } });
    const { result } = renderHook(() => useCityImages());
    await act(async () => {
      await result.current.fetchCityImage('city-1', 'Test');
    });
    expect(result.current.error).toBe('Rate limit');
  });

  it('should set error when data.success is false', async () => {
    mockInvoke.mockResolvedValue({ data: { success: false, error: 'Not found' }, error: null });
    const { result } = renderHook(() => useCityImages());
    await act(async () => {
      await result.current.fetchCityImage('city-1', 'Test');
    });
    expect(result.current.error).toBe('Not found');
  });
});
