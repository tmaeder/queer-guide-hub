import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => rpcMock(name, args),
    from: () => {
      const handler: ProxyHandler<object> = {
        get: (_t, p) =>
          p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler),
        apply: () => new Proxy(() => {}, handler),
      };
      return new Proxy(() => {}, handler);
    },
  },
}));

vi.mock('@/utils/fetchWithRetry', () => ({
  queryWithRetry: (fn: () => Promise<unknown>) => fn(),
}));

import { fetchEventsPage } from '../useEvents';

describe('fetchEventsPage filters → search_events RPC', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it('sends the raw city label (server normalizes via unaccent)', async () => {
    await fetchEventsPage({ city: 'Zurich' });
    expect(rpcMock).toHaveBeenCalledWith(
      'search_events',
      expect.objectContaining({ p_city: 'Zurich' }),
    );
  });

  it('passes ISO start/end for dateRange through unchanged', async () => {
    const dateRange = {
      start: '2026-05-21T22:00:00.000Z',
      end: '2026-05-29T21:59:59.999Z',
    };
    await fetchEventsPage({ dateRange });
    expect(rpcMock).toHaveBeenCalledWith(
      'search_events',
      expect.objectContaining({
        p_start: dateRange.start,
        p_end: dateRange.end,
      }),
    );
  });

  it('sends both city and date together', async () => {
    await fetchEventsPage({
      city: 'Zürich',
      dateRange: { start: 'a', end: 'b' },
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'search_events',
      expect.objectContaining({ p_city: 'Zürich', p_start: 'a', p_end: 'b' }),
    );
  });

  it('sends stable city and country identities for namesake-safe retrieval', async () => {
    await fetchEventsPage({
      cityId: '00000000-0000-0000-0000-000000000001',
      city: 'Berlin',
      countryId: '00000000-0000-0000-0000-000000000002',
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'search_events',
      expect.objectContaining({
        p_city_id: '00000000-0000-0000-0000-000000000001',
        p_city: 'Berlin',
        p_country_id: '00000000-0000-0000-0000-000000000002',
      }),
    );
  });

  it('surfaces RPC errors as a rejection (not silent empty)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('rpc boom') });
    await expect(fetchEventsPage({ city: 'Zurich' })).rejects.toThrow(/rpc boom/);
  });

  it('empty result with no error stays empty (true empty)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const result = await fetchEventsPage({ city: 'Nowhere' });
    expect(result?.events).toEqual([]);
  });

  it('unwraps {total,event} rows into plain events', async () => {
    const event = { id: '1', title: 'Pride', city: 'Zürich', attendee_count: 0 };
    rpcMock.mockResolvedValue({ data: [{ total: 1, event }], error: null });
    const result = await fetchEventsPage({ city: 'Zurich' });
    expect(result?.events).toEqual([event]);
  });

  it('does NOT use RPC when only nearMe is set', async () => {
    // The client-query mock is an inert proxy; only the routing matters here.
    await fetchEventsPage({ nearMe: { lat: 47, lng: 8 } }).catch(() => {});
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
