import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVisitorLocation } from '../useVisitorLocation';

describe('useVisitorLocation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('should start loading', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const { result } = renderHook(() => useVisitorLocation());
    expect(result.current.loading).toBe(true);
  });

  it('should return location from API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ latitude: 47.37, longitude: 8.54, city: 'Zurich', country: 'CH' })),
    );
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location?.latitude).toBe(47.37);
    expect(result.current.location?.city).toBe('Zurich');
  });

  it('does not persist coordinates to web storage (memory-only)', async () => {
    // The hook keeps geo in memory only — sensitive coordinates must never be
    // written to sessionStorage/localStorage (see hook docstring).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ latitude: 47.37, longitude: 8.54 })),
    );
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location?.latitude).toBe(47.37);
    expect(sessionStorage.getItem('ip_geo')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('fetches the same-origin /api/geo endpoint (no external vendor)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ latitude: 52.52, longitude: 13.4 })),
    );
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location?.latitude).toBe(52.52);
    expect(fetchSpy).toHaveBeenCalledWith('/api/geo');
  });

  it('should handle fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network'));
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location).toBeNull();
  });
});
