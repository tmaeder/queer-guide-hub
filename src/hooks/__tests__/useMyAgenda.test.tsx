/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
  result: { data: [] as unknown[], error: null as unknown },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (name: string, args: Record<string, unknown>) => {
    state.rpc.push({ name, args });
    return Promise.resolve(state.result);
  },
}));

import { useMyAgenda, type AgendaItem } from '../useMyAgenda';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const item = (over: Partial<AgendaItem>): AgendaItem => ({
  id: 'x',
  kind: 'event_rsvp',
  title: 'T',
  subtitle: null,
  starts_at: '2026-08-10T18:00:00Z',
  ends_at: null,
  all_day: false,
  status: 'going',
  open_target: '/events/x',
  ...over,
});

beforeEach(() => {
  state.rpc.length = 0;
  state.result = { data: [], error: null };
});

describe('useMyAgenda', () => {
  it('calls get_my_agenda with the ISO window bounds', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-10-01T00:00:00Z');
    renderHook(() => useMyAgenda(from, to), { wrapper });
    await waitFor(() => expect(state.rpc.length).toBe(1));
    expect(state.rpc[0]).toEqual({
      name: 'get_my_agenda',
      args: { p_from: from.toISOString(), p_to: to.toISOString() },
    });
  });

  it('groups items into days preserving order', async () => {
    state.result = {
      data: [
        item({ id: 'a', starts_at: '2026-08-10T09:00:00Z' }),
        item({ id: 'b', starts_at: '2026-08-10T20:00:00Z' }),
        item({ id: 'c', starts_at: '2026-08-12T12:00:00Z' }),
      ],
      error: null,
    };
    const { result } = renderHook(
      () => useMyAgenda(new Date('2026-08-01'), new Date('2026-09-01')),
      { wrapper },
    );
    await waitFor(() => expect(result.current.days.length).toBeGreaterThan(0));
    // Two distinct local days; first holds the two Aug-10 items in order.
    expect(result.current.days).toHaveLength(2);
    expect(result.current.days[0].items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.days[1].items.map((i) => i.id)).toEqual(['c']);
  });

  it('accepts group_event items (5th get_my_agenda UNION branch)', async () => {
    state.result = {
      data: [
        item({
          id: 'grpevt_1',
          kind: 'group_event',
          title: 'Queer Hikers meetup',
          subtitle: 'Queer Hikers',
          starts_at: '2026-08-15T17:00:00Z',
          status: 'active',
          open_target: '/events/queer-hikers-meetup',
        }),
      ],
      error: null,
    };
    const { result } = renderHook(
      () => useMyAgenda(new Date('2026-08-01'), new Date('2026-09-01')),
      { wrapper },
    );
    await waitFor(() => expect(result.current.days.length).toBe(1));
    expect(result.current.items[0]).toMatchObject({ kind: 'group_event', subtitle: 'Queer Hikers' });
  });
});
