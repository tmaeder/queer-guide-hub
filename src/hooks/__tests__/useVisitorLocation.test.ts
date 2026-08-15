import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVisitorLocation, __resetVisitorLocationCache } from '../useVisitorLocation';

describe('useVisitorLocation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    // The hook caches at module scope so N mounts cost one request — reset it
    // between cases or the first case's response answers all the others.
    __resetVisitorLocationCache();
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
    expect(fetchSpy).toHaveBeenCalledWith('/api/geo', expect.objectContaining({ signal: expect.anything() }));
  });

  it('should handle fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network'));
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location).toBeNull();
  });

  it('issues ONE request for many concurrent mounts', async () => {
    // `/api/geo` is a billed Pages-Function invocation and the homepage mounts
    // several geo consumers; before the module cache each one fetched its own.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ latitude: 52.52, longitude: 13.4, city: 'Berlin' })),
    );
    const a = renderHook(() => useVisitorLocation());
    const b = renderHook(() => useVisitorLocation());
    const c = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    await waitFor(() => expect(c.result.current.loading).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(c.result.current.location?.city).toBe('Berlin');
  });

  it('serves a later mount from cache without re-fetching or re-flashing loading', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ latitude: 52.52, longitude: 13.4, city: 'Berlin' })),
    );
    const first = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    const later = renderHook(() => useVisitorLocation());
    // Settled on the very first render — no skeleton flash for data we have.
    expect(later.result.current.loading).toBe(false);
    expect(later.result.current.location?.city).toBe('Berlin');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('settles to null when the edge hangs past the timeout', async () => {
    // Without a timeout a silent edge left every consumer loading forever,
    // which renders as a permanently blank section rather than a degraded one.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    );
    const { result } = renderHook(() => useVisitorLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location).toBeNull();
  });
});
