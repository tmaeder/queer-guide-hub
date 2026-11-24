import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InboxItem } from '@/hooks/useInboxFeed';
import type { User } from '@supabase/supabase-js';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { useInboxSearch } from '../useInboxSearch';
const user = { id: 'u1' } as User;
const item = { id: 'conv_1', title: 'Alex', preview: 'Meeting' } as InboxItem;
describe('inbox search isolation', () => {
  it('does not show stale server hits while a new query is pending', async () => {
    rpc.mockResolvedValue({ data: [item], error: null });
    const { result, rerender } = renderHook(({ q }) => useInboxSearch([], user, false, q), {
      initialProps: { q: 'first' },
    });
    await waitFor(() => expect(result.current.visibleItems).toHaveLength(1));
    rerender({ q: 'second' });
    expect(result.current.visibleItems).toEqual([]);
    expect(result.current.searching).toBe(true);
    await waitFor(() => expect(result.current.searching).toBe(false));
  });
  it('ignores results from a previous account and a cancelled request', async () => {
    let finish!: (data: unknown) => void;
    rpc
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({ data: [], error: null });
    const { result, rerender } = renderHook(
      ({ account }) => useInboxSearch([], account, false, 'query'),
      {
        initialProps: { account: user },
      },
    );
    await waitFor(() => expect(finish).toBeDefined());
    rerender({ account: { id: 'u2' } as User });
    await act(async () => finish({ data: [item], error: null }));
    expect(result.current.visibleItems).toEqual([]);
  });
});
