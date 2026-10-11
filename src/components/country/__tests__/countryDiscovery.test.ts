import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as { method: string; args: unknown[] }[],
  data: [] as Record<string, unknown>[],
  count: 0,
  error: null as Error | null,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      state.calls.push({ method: 'from', args: [table] });
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['select', 'eq', 'neq', 'is', 'ilike', 'or', 'order', 'lte']) {
        chain[method] = (...args) => {
          state.calls.push({ method, args });
          return chain;
        };
      }
      chain.range = (...args) => {
        state.calls.push({ method: 'range', args });
        return Promise.resolve({ data: state.data, count: state.count, error: state.error });
      };
      return chain;
    },
  },
}));
import { fetchCountryDiscovery, EMPTY_DISCOVERY_FILTERS } from '@/hooks/useCountryDiscoveryGallery';

describe('country gallery queries', () => {
  beforeEach(() => {
    state.calls = [];
    state.data = [];
    state.count = 0;
    state.error = null;
  });

  it('applies venue filters and country scope before paging, and prefers real photos to logos', async () => {
    state.data = [
      {
        id: 'v1',
        name: 'A bar',
        slug: 'a-bar',
        images: ['https://example.com/photo.jpg'],
        logo_url: 'https://example.com/logo.png',
      },
    ];
    state.count = 25;
    const result = await fetchCountryDiscovery(
      'venue',
      'de',
      {
        ...EMPTY_DISCOVERY_FILTERS,
        city: 'Berlin',
        cityId: 'berlin-id',
        category: 'bar',
        price: '2',
        verified: true,
      },
      2,
    );
    for (const args of [
      ['country_id', 'de'],
      ['city_id', 'berlin-id'],
      ['category', 'bar'],
      ['price_range', 2],
      ['verified', true],
    ]) {
      expect(state.calls).toContainEqual({ method: 'eq', args });
    }
    expect(state.calls).toContainEqual({ method: 'range', args: [16, 23] });
    expect(state.calls).toContainEqual({ method: 'is', args: ['closed_at', null] });
    expect(state.calls).toContainEqual({ method: 'neq', args: ['review_status', 'archived'] });
    expect(result.total).toBe(25);
    expect(result.items[0].image).toBe('https://example.com/photo.jpg');
    expect(result.items[0].isLogo).toBe(false);
  });

  it('includes ongoing events in an explicit date range without collapsing requested occurrences', async () => {
    await fetchCountryDiscovery(
      'event',
      'de',
      {
        ...EMPTY_DISCOVERY_FILTERS,
        cityId: 'berlin-id',
        free: true,
        from: '2026-10-12',
        until: '2026-10-16',
      },
      0,
    );
    const from = new Date('2026-10-12T00:00:00').toISOString();
    expect(state.calls).toContainEqual({
      method: 'or',
      args: [`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`],
    });
    expect(state.calls).toContainEqual({
      method: 'lte',
      args: ['start_date', new Date('2026-10-16T23:59:59.999').toISOString()],
    });
    expect(state.calls).toContainEqual({ method: 'eq', args: ['country_id', 'de'] });
    expect(state.calls).toContainEqual({ method: 'eq', args: ['is_free', true] });
    expect(state.calls.some((call) => call.args[0] === 'series_next')).toBe(false);
  });

  it('supports a city beyond the suggestions and folds repeats in the default upcoming feed', async () => {
    await fetchCountryDiscovery('event', 'de', { ...EMPTY_DISCOVERY_FILTERS, city: 'Bonn' }, 0);
    expect(state.calls).toContainEqual({ method: 'ilike', args: ['city', '%Bonn%'] });
    expect(state.calls).toContainEqual({ method: 'eq', args: ['series_next', true] });
    expect(state.calls).toContainEqual({ method: 'is', args: ['parent_event_id', null] });
  });

  it('surfaces failures rather than presenting a failed query as no matches', async () => {
    state.error = new Error('Offline');
    await expect(fetchCountryDiscovery('venue', 'de', EMPTY_DISCOVERY_FILTERS, 0)).rejects.toThrow(
      'Offline',
    );
  });
});
