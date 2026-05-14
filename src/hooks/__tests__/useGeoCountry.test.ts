import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeoCountry } from '../useGeoCountry';

describe('useGeoCountry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers the explicit initial value when given', () => {
    const { result } = renderHook(() => useGeoCountry('us'));
    expect(result.current.country).toBe('US');
    expect(result.current.loading).toBe(false);
  });

  it('uses cf.country from /api/geo when no initial / storage', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ country: 'DE' }), { status: 200 }),
      );
    const { result } = renderHook(() => useGeoCountry(null));
    await waitFor(() => expect(result.current.country).toBe('DE'));
    expect(fetchSpy).toHaveBeenCalledWith('/api/geo', expect.any(Object));
  });

  it('falls back to navigator.language when geo fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    Object.defineProperty(navigator, 'language', {
      value: 'de-DE',
      configurable: true,
    });
    const { result } = renderHook(() => useGeoCountry(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.country).toBe('DE');
  });

  it('reads from localStorage if set', () => {
    window.localStorage.setItem('qg_help_country', 'GB');
    const { result } = renderHook(() => useGeoCountry(null));
    expect(result.current.country).toBe('GB');
    expect(result.current.loading).toBe(false);
  });
});
