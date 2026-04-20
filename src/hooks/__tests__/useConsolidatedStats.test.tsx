import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => rpcMock(name, args),
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

import { useConsolidatedStats } from '../useConsolidatedStats';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

describe('useConsolidatedStats', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rpcMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns null stats and loading=true before fetch resolves', () => {
    rpcMock.mockReturnValue(new Promise(() => {}));
    const client = makeClient();
    const { result } = renderHook(() => useConsolidatedStats(), { wrapper: wrapper(client) });
    expect(result.current.loading).toBe(true);
    expect(result.current.stats.venues).toBeNull();
  });

  it('populates stats on successful RPC', async () => {
    rpcMock.mockResolvedValue({
      data: {
        venues: 120, profiles: 50, cities: 12, countries: 5, events: 80,
        posts: 30, personalities: 10, groups: 8, tags: 200, marketplace: 40,
        news: 15, cms: 7, generated_at: '2026-04-19T00:00:00Z',
      },
      error: null,
    });
    const client = makeClient();
    const { result } = renderHook(() => useConsolidatedStats(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats.venues).toBe(120);
    expect(result.current.stats.profiles).toBe(50);
    expect(result.current.stats.cities).toBe(12);
    expect(result.current.stats.events).toBe(80);
    expect(result.current.error).toBeNull();
  });

  it('surfaces error and logs it when RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const client = makeClient();
    const { result } = renderHook(() => useConsolidatedStats(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 4000 });
    expect(result.current.stats.venues).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[homepage-stats] aggregation failed',
      expect.anything(),
    );
  });

  it('handles empty dataset (all zeros)', async () => {
    rpcMock.mockResolvedValue({
      data: {
        venues: 0, profiles: 0, cities: 0, countries: 0, events: 0, posts: 0,
        personalities: 0, groups: 0, tags: 0, marketplace: 0, news: 0, cms: 0,
      },
      error: null,
    });
    const client = makeClient();
    const { result } = renderHook(() => useConsolidatedStats(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats.venues).toBe(0);
    expect(result.current.stats.events).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('coerces missing / non-numeric fields to null (partial failure)', async () => {
    rpcMock.mockResolvedValue({
      data: { venues: 120, cities: null, events: 80 },
      error: null,
    });
    const client = makeClient();
    const { result } = renderHook(() => useConsolidatedStats(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats.venues).toBe(120);
    expect(result.current.stats.cities).toBeNull();
    expect(result.current.stats.events).toBe(80);
    expect(result.current.stats.profiles).toBeNull();
  });

  it('shares cache across hook instances with same QueryClient', async () => {
    rpcMock.mockResolvedValue({
      data: { venues: 1, profiles: 1, cities: 1, countries: 1, events: 1, posts: 1, personalities: 1, groups: 1, tags: 1, marketplace: 1, news: 1, cms: 1 },
      error: null,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 30_000, staleTime: 30_000 } },
    });
    const { result: r1 } = renderHook(() => useConsolidatedStats(), { wrapper: wrapper(client) });
    await waitFor(() => expect(r1.current.loading).toBe(false));
    const { result: r2 } = renderHook(() => useConsolidatedStats(), { wrapper: wrapper(client) });
    expect(r2.current.stats.venues).toBe(1);
    expect(rpcMock).toHaveBeenCalledTimes(1);

    await client.invalidateQueries({ queryKey: ['homepage-stats'] });
    await waitFor(() => expect(rpcMock.mock.calls.length).toBeGreaterThan(1));
  });
});
