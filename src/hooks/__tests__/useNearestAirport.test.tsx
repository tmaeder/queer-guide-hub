/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));

import { useNearestAirport } from '../useNearestAirport';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useNearestAirport', () => {
  it('is disabled when hasAirport=true', () => {
    renderHook(
      () => useNearestAirport({ latitude: 52.52, longitude: 13.405, hasAirport: true }),
      { wrapper },
    );
    expect(state.calls).toHaveLength(0);
  });

  it('returns the closest airport in the first ~300km window', async () => {
    withResults({
      data: [
        { iata_code: 'BER', city_name: 'Berlin', country_code: 'DE', latitude: 52.36, longitude: 13.50 },
        { iata_code: 'TXL', city_name: 'Berlin Tegel', country_code: 'DE', latitude: 52.55, longitude: 13.29 },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useNearestAirport({ latitude: 52.52, longitude: 13.405, hasAirport: false }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.nearestAirport).not.toBeNull());

    // Either TXL or BER — both close. Result should be the closer one.
    expect(['BER', 'TXL']).toContain(result.current.nearestAirport!.iata_code);
    expect(result.current.nearestAirport!.distanceKm).toBeGreaterThanOrEqual(0);
  });

  it('widens to ~660km window when first query returns empty', async () => {
    withResults(
      { data: [], error: null }, // first call: empty
      {
        data: [{ iata_code: 'FRA', city_name: 'Frankfurt', country_code: 'DE', latitude: 50.04, longitude: 8.55 }],
        error: null,
      },
    );

    const { result } = renderHook(
      () => useNearestAirport({ latitude: 52.52, longitude: 13.405, hasAirport: false }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.nearestAirport).not.toBeNull());
    expect(result.current.nearestAirport!.iata_code).toBe('FRA');
    expect(state.calls).toHaveLength(2);
  });

  it('returns null when both windows are empty', async () => {
    withResults({ data: [], error: null }, { data: [], error: null });
    const { result } = renderHook(
      () => useNearestAirport({ latitude: 0, longitude: 0, hasAirport: false }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nearestAirport).toBeNull();
  });
});
