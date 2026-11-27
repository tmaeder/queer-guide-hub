import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIntentLocation } from '../useIntentLocation';

const { lookup, filters, visitor } = vi.hoisted(() => ({
  lookup: vi.fn(),
  filters: vi.fn(),
  visitor: { location: null, loading: false },
}));
vi.mock('@/hooks/useUserTravelPreferences', () => ({
  useUserTravelPreferences: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/regionOverride', () => ({
  REGION_EVENT: 'test-region-change',
  readOverride: () => null,
  useCityIdentity: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/useVisitorLocation', () => ({ useVisitorLocation: () => visitor }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          filters(...args);
          return { maybeSingle: lookup };
        },
      }),
    }),
  },
}));
const city = {
  id: 'c1',
  name: 'Zürich',
  slug: 'zurich',
  latitude: 47.37,
  longitude: 8.54,
  country_id: 'ch',
  countries: { id: 'ch', code: 'CH' },
};

beforeEach(() => {
  lookup.mockReset();
  filters.mockReset();
});

describe('explicit Meet location', () => {
  it('resolves explicit city IDs without replacing the chosen city', async () => {
    lookup.mockResolvedValue({ data: city, error: null });
    const { result } = renderHook(() => useIntentLocation(undefined, { cityId: 'c1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(filters).toHaveBeenCalledWith('id', 'c1');
    expect(result.current).toMatchObject({
      cityId: 'c1',
      cityName: 'Zürich',
      inferred: false,
    });
  });

  it('does not replace an unavailable explicit city with inferred location and supports retry', async () => {
    lookup
      .mockResolvedValueOnce({ data: null, error: new Error('offline') })
      .mockResolvedValue({ data: city, error: null });
    const { result } = renderHook(() => useIntentLocation('zurich'));
    await waitFor(() => expect(result.current.error).toBe('unavailable'));
    expect(result.current.cityId).toBeNull();
    act(() => result.current.retry?.());
    await waitFor(() => expect(result.current.cityId).toBe('c1'));
    expect(result.current.error).toBeUndefined();
  });

  it('marks a changed selection as loading before its lookup completes', async () => {
    lookup.mockResolvedValueOnce({ data: city, error: null });
    const { result, rerender } = renderHook(({ slug }) => useIntentLocation(slug), {
      initialProps: { slug: 'zurich' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    lookup.mockReturnValue(new Promise(() => {}));
    rerender({ slug: 'berlin' });
    expect(result.current.loading).toBe(true);
  });
});
