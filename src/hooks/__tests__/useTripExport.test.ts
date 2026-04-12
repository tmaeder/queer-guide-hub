import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import { useTripExport } from '../useTripExport';

describe('useTripExport', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should start not exporting', () => {
    const { result } = renderHook(() => useTripExport('trip-1'));
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should set error when no tripId', async () => {
    const { result } = renderHook(() => useTripExport(undefined));
    await act(async () => { await result.current.exportTripPdf(); });
    expect(result.current.error).toBe('No trip ID provided');
  });

  it('should call edge function with trip_id', async () => {
    mockInvoke.mockResolvedValue({ data: '<html>PDF</html>', error: null });
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const { result } = renderHook(() => useTripExport('trip-123'));
    await act(async () => { await result.current.exportTripPdf(); });
    expect(mockInvoke).toHaveBeenCalledWith('generate-trip-pdf', { body: { trip_id: 'trip-123' } });
    expect(result.current.isExporting).toBe(false);
    vi.restoreAllMocks();
  });

  it('should set error on function failure', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'PDF gen failed' } });
    const { result } = renderHook(() => useTripExport('trip-1'));
    await act(async () => { await result.current.exportTripPdf(); });
    expect(result.current.error).toBe('PDF gen failed');
  });
});
