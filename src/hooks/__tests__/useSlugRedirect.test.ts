import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSlugRedirect } from '../useSlugRedirect';

const CONFIG = {
  redirectTable: 'event_slug_redirects',
  redirectIdColumn: 'event_id',
  entityTable: 'events',
};

let fromImpl: (table: string) => unknown = () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => fromImpl(table) },
}));

describe('useSlugRedirect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fromImpl = () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
  });

  it('returns null when oldSlug is null (no lookup fired)', () => {
    const { result } = renderHook(() => useSlugRedirect(CONFIG, null));
    expect(result.current).toBeNull();
  });

  it('returns null when no redirect row exists', async () => {
    const { result } = renderHook(() => useSlugRedirect(CONFIG, 'old-event-slug'));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('resolves the canonical slug when a redirect exists', async () => {
    fromImpl = (table: string) => {
      if (table === 'event_slug_redirects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { event_id: 'canon-1' }, error: null }) }),
          }),
        };
      }
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { slug: 'new-event-slug' }, error: null }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    };
    const { result } = renderHook(() => useSlugRedirect(CONFIG, 'old-event-slug'));
    await waitFor(() => expect(result.current).toBe('new-event-slug'));
  });

  it('returns null when the redirect target IS the old slug (no-op guard)', async () => {
    fromImpl = (table: string) => {
      if (table === 'event_slug_redirects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { event_id: 'canon-1' }, error: null }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { slug: 'old-event-slug' }, error: null }) }),
        }),
      };
    };
    const { result } = renderHook(() => useSlugRedirect(CONFIG, 'old-event-slug'));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('fails closed (returns null) when the lookup throws', async () => {
    fromImpl = () => {
      throw new Error('network error');
    };
    const { result } = renderHook(() => useSlugRedirect(CONFIG, 'old-event-slug'));
    await waitFor(() => expect(result.current).toBeNull());
  });
});
