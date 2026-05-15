/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useAirlineData } from '../useAirlineData';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockFetch(payload: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch([]));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAirlineData', () => {
  it('parses the Travelpayouts response into an IATA→Airline map', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { iata: 'LH', name: 'Lufthansa', is_lowcost: false },
      { iata: 'U2', name: 'easyJet', is_lowcost: true },
      { iata: '', name: 'Skipped' }, // no IATA → skipped
    ]));

    const { result } = renderHook(() => useAirlineData(), { wrapper });
    await waitFor(() => expect(result.current.airlines).toBeDefined());

    expect(result.current.airlines?.size).toBe(2);
    expect(result.current.airlines?.get('LH')).toEqual({
      iata: 'LH',
      name: 'Lufthansa',
      isLowCost: false,
    });
  });

  it('falls back to name_translations.en or iata when name is missing', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { iata: 'AA', name_translations: { en: 'American Airlines' } },
      { iata: 'XX' },
    ]));

    const { result } = renderHook(() => useAirlineData(), { wrapper });
    await waitFor(() => expect(result.current.airlines).toBeDefined());

    expect(result.current.airlines?.get('AA')?.name).toBe('American Airlines');
    expect(result.current.airlines?.get('XX')?.name).toBe('XX');
  });

  it('returns an empty map on fetch error', async () => {
    vi.stubGlobal('fetch', mockFetch(null, false));

    const { result } = renderHook(() => useAirlineData(), { wrapper });
    await waitFor(() => expect(result.current.airlines).toBeDefined());
    expect(result.current.airlines?.size).toBe(0);
  });

  it('getAirline returns undefined for null/missing iata', async () => {
    vi.stubGlobal('fetch', mockFetch([{ iata: 'LH', name: 'Lufthansa' }]));

    const { result } = renderHook(() => useAirlineData(), { wrapper });
    await waitFor(() => expect(result.current.airlines?.size).toBeGreaterThan(0));

    expect(result.current.getAirline(null)).toBeUndefined();
    expect(result.current.getAirline('')).toBeUndefined();
    expect(result.current.getAirline('XX')).toBeUndefined();
    expect(result.current.getAirline('lh')?.iata).toBe('LH'); // case insensitive
  });

  it('getAirlineLogo builds the avs.io URL with default size 64', async () => {
    const { result } = renderHook(() => useAirlineData(), { wrapper });
    expect(result.current.getAirlineLogo('lh')).toBe('https://pics.avs.io/64/64/LH.png');
    expect(result.current.getAirlineLogo('lh', 128)).toBe('https://pics.avs.io/128/128/LH.png');
    expect(result.current.getAirlineLogo(null)).toBeUndefined();
  });
});
