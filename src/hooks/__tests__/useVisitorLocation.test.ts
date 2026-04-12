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

  it('should cache in sessionStorage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ latitude: 47.37, longitude: 8.54 })),
    );
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const cached = JSON.parse(sessionStorage.getItem('ip_geo')!);
    expect(cached.latitude).toBe(47.37);
  });

  it('should use cached data from sessionStorage', async () => {
    sessionStorage.setItem('ip_geo', JSON.stringify({ latitude: 52.52, longitude: 13.4 }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location?.latitude).toBe(52.52);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should handle fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network'));
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location).toBeNull();
  });
});
