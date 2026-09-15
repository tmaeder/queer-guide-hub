import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * `fetchEvents` publishes results with a bare `setEvents(...)`, so before this
 * guard the list showed whichever request RESOLVED last, not the one that was
 * issued last. It accepts an AbortSignal, but no caller on /events has ever
 * passed one, so nothing cancelled a superseded request.
 *
 * That inversion is not hypothetical or rare: a broad query is SLOWER than the
 * narrow one that supersedes it (it counts a far larger set, and a page of rows
 * costs an extra attendee-count round-trip that an empty result skips), so the
 * stale response routinely wins the race it is in.
 */

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

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const row = (id: string, title: string) => ({
  total: 1,
  event: { id, title, start_date: '2026-09-11T10:00:00Z' },
});

describe('useEvents — the newest request owns the list', () => {
  beforeEach(() => rpcMock.mockReset());

  it('drops a stale response that resolves after a newer one', async () => {
    const stale = deferred<unknown>();
    const fresh = deferred<unknown>();

    rpcMock.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name !== 'search_events') return Promise.resolve({ data: [] });
      return args?.p_city === 'StaleCity' ? stale.promise : fresh.promise;
    });

    const { result } = renderHook(() => useEvents(false));

    // Both in flight: the broad one first, the one the user actually asked for
    // second — the exact mount ordering on /events.
    let stalePending!: Promise<unknown>;
    let freshPending!: Promise<unknown>;
    act(() => {
      stalePending = result.current.fetchEvents({ city: 'StaleCity' });
      freshPending = result.current.fetchEvents({ city: 'FreshCity' });
    });

    // The newer request comes back first...
    await act(async () => {
      fresh.resolve({ data: [row('fresh-1', 'Fresh event')], error: null });
      await freshPending;
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].id).toBe('fresh-1');

    // ...and the older one lands afterwards. It must not repaint the list.
    await act(async () => {
      stale.resolve({ data: [row('stale-1', 'Stale event')], error: null });
      await stalePending;
    });

    expect(result.current.events.map((e) => e.id)).toEqual(['fresh-1']);
  });

  it('keeps loading true when a stale response lands before the newest one', async () => {
    // `loading` belongs to the newest request. If a superseded response clears
    // it, the spinner vanishes while the query the user is actually waiting for
    // is still running, and the page reads as finished over results that are
    // about to change.
    const stale = deferred<unknown>();
    const fresh = deferred<unknown>();

    rpcMock.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name !== 'search_events') return Promise.resolve({ data: [] });
      return args?.p_city === 'StaleCity' ? stale.promise : fresh.promise;
    });

    const { result } = renderHook(() => useEvents(false));

    let stalePending!: Promise<unknown>;
    let freshPending!: Promise<unknown>;
    act(() => {
      stalePending = result.current.fetchEvents({ city: 'StaleCity' });
      freshPending = result.current.fetchEvents({ city: 'FreshCity' });
    });
    expect(result.current.loading).toBe(true);

    // Superseded response settles while the newest request is still in flight.
    await act(async () => {
      stale.resolve({ data: [row('stale-1', 'Stale event')], error: null });
      await stalePending;
    });
    expect(result.current.loading).toBe(true);

    // Only the newest request may end the loading state.
    await act(async () => {
      fresh.resolve({ data: [row('fresh-1', 'Fresh event')], error: null });
      await freshPending;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.id)).toEqual(['fresh-1']);
  });
});
