import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

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

import { useEvents } from '../useEvents';

describe('useEvents filters → search_events RPC', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it('sends the raw city label (server normalizes via unaccent)', async () => {
    const { result } = renderHook(() => useEvents(false));
    await act(async () => {
      await result.current.fetchEvents({ city: 'Zurich' });
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'search_events',
      expect.objectContaining({ p_city: 'Zurich' }),
    );
  });

  it('passes ISO start/end for dateRange through unchanged', async () => {
    const { result } = renderHook(() => useEvents(false));
    const dateRange = {
      start: '2026-05-21T22:00:00.000Z',
      end: '2026-05-29T21:59:59.999Z',
    };
    await act(async () => {
      await result.current.fetchEvents({ dateRange });
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'search_events',
      expect.objectContaining({
        p_start: dateRange.start,
        p_end: dateRange.end,
      }),
    );
  });

  it('sends both city and date together', async () => {
    const { result } = renderHook(() => useEvents(false));
    await act(async () => {
      await result.current.fetchEvents({
        city: 'Zürich',
        dateRange: { start: 'a', end: 'b' },
      });
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'search_events',
      expect.objectContaining({ p_city: 'Zürich', p_start: 'a', p_end: 'b' }),
    );
  });

  it('surfaces RPC errors as hook error (not silent empty)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('rpc boom') });
    const { result } = renderHook(() => useEvents(false));
    await act(async () => {
      await result.current.fetchEvents({ city: 'Zurich' });
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toMatch(/rpc boom/);
  });

  it('empty result with no error stays empty (true empty)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useEvents(false));
    await act(async () => {
      await result.current.fetchEvents({ city: 'Nowhere' });
    });
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('unwraps {total,event} rows into plain events', async () => {
    const event = { id: '1', title: 'Pride', city: 'Zürich' };
    rpcMock.mockResolvedValue({ data: [{ total: 1, event }], error: null });
    const { result } = renderHook(() => useEvents(false));
    await act(async () => {
      await result.current.fetchEvents({ city: 'Zurich' });
    });
    expect(result.current.events).toEqual([event]);
  });

  it('does NOT use RPC when only nearMe is set', async () => {
    const { result } = renderHook(() => useEvents(false));
    await act(async () => {
      await result.current.fetchEvents({ nearMe: { lat: 47, lng: 8 } });
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
