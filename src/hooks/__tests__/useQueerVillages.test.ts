import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestProviders } from '@/test/test-utils';

const { calls, result } = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[]]>,
  result: { data: [] as unknown[], error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  return { supabase: { from: () => builder } };
});

import { useQueerVillages } from '../useQueerVillages';

describe('useQueerVillages', () => {
  beforeEach(() => {
    calls.length = 0;
    result.data = [{ id: 'v1', name: 'Chueca' }];
    result.error = null;
  });

  it('stays idle while the city is unknown', () => {
    const { result: r } = renderHook(() => useQueerVillages({ cityId: null }), {
      wrapper: TestProviders,
    });
    expect(r.current.villages).toEqual([]);
    expect(r.current.loading).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('filters by city and selects every column for a city', async () => {
    const { result: r } = renderHook(() => useQueerVillages({ cityId: 'c1' }), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(r.current.villages).toHaveLength(1));
    expect(calls).toContainEqual(['eq', ['city_id', 'c1']]);
    expect(String(calls.find(([m]) => m === 'select')?.[1][0])).toMatch(/^\*/);
  });

  it('fetches the lean unfiltered list with no city filter', async () => {
    const { result: r } = renderHook(() => useQueerVillages(), { wrapper: TestProviders });
    await waitFor(() => expect(r.current.loading).toBe(false));
    expect(calls.some(([m]) => m === 'eq')).toBe(false);
    expect(String(calls.find(([m]) => m === 'select')?.[1][0])).not.toMatch(/^\*/);
  });

  it('reports a fetch error', async () => {
    result.error = new Error('DB down');
    const { result: r } = renderHook(() => useQueerVillages(), { wrapper: TestProviders });
    await waitFor(() => expect(r.current.error).toBe('DB down'));
  });
});
