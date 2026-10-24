import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { TestProviders } from '@/test/test-utils';

const { auth, page } = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null },
  page: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/blueskyActivity', () => ({ mirrorRsvp: vi.fn() }));
// The city filter routes through the search_events RPC; `page` stands in for it.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string) => {
      const result =
        name === 'search_events'
          ? page().then((r: { events: Array<{ id: string }> }) => ({
              data: r.events.map((event) => ({ total: r.events.length, event })),
              error: null,
            }))
          : Promise.resolve({ data: [], error: null });
      return Object.assign(result, { abortSignal: () => result });
    },
  },
}));

import * as eventsModule from '../useEvents';

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(TestProviders, { queryClient: client }, children);
}

describe('useEventsQuery', () => {
  beforeEach(() => {
    auth.user = null;
    page.mockReset();
  });

  it('stays idle while the scope is unknown', () => {
    const { result } = renderHook(() => eventsModule.useEventsQuery(null), {
      wrapper: wrapperWith(new QueryClient()),
    });
    expect(result.current.events).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  // events are safety-gated by RLS and the cache is not cleared on sign-out.
  it('never serves a signed-in result to the anonymous viewer, even with keepPrevious', async () => {
    page.mockImplementation(async () => ({
      events: [{ id: 'gated' }],
      count: 1,
    }));
    let release: () => void = () => {};
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    auth.user = { id: 'u1' };
    const { result, rerender } = renderHook(
      () => eventsModule.useEventsQuery({ cityId: 'c1' }, { keepPrevious: true }),
      { wrapper: wrapperWith(client) },
    );
    await waitFor(() => expect(result.current.events).toMatchObject([{ id: 'gated' }]));

    page.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ events: [{ id: 'public' }], count: 1 });
        }),
    );
    auth.user = null;
    rerender();
    // While the anon query is in flight, nothing from the signed-in key shows.
    expect(result.current.events).toEqual([]);
    release();
    await waitFor(() => expect(result.current.events).toMatchObject([{ id: 'public' }]));
  });
});
