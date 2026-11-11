/**
 * @vitest-environment jsdom
 *
 * Intent pages (GoingOut, People, Travel) must keep the region the visitor
 * picked on the homepage, and their profile home city, instead of dropping
 * back to the IP city. A `?city=` still wins, and is never written back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestProviders } from '@/test/test-utils';

const mocks = vi.hoisted(() => ({
  geo: { location: null as { city?: string; country?: string } | null, loading: false },
  prefs: { data: null as { home_city_id: string | null } | null, isLoading: false },
  rows: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/useVisitorLocation', () => ({ useVisitorLocation: () => mocks.geo }));
vi.mock('@/hooks/useUserTravelPreferences', () => ({
  useUserTravelPreferences: () => mocks.prefs,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => ({ data: mocks.rows[val] ?? null }),
        }),
      }),
    }),
  },
}));

import { useIntentLocation } from '../useIntentLocation';

const row = (id: string, name: string, code: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  country_id: `c-${id}`,
  countries: { id: `c-${id}`, code, name: code },
});

function pick(cityId: string, cityName: string) {
  sessionStorage.setItem(
    'qg_home_region',
    JSON.stringify({
      cityId,
      citySlug: cityName.toLowerCase(),
      cityName,
      countryId: 'c-pt',
      countryCode: 'PT',
      countryName: 'Portugal',
      ts: Date.now(),
    }),
  );
}

const render = (slug?: string | null, opts?: { ipOnly?: boolean }) =>
  renderHook(() => useIntentLocation(slug, opts), { wrapper: TestProviders });

beforeEach(() => {
  sessionStorage.clear();
  mocks.geo = { location: null, loading: false };
  mocks.prefs = { data: null, isLoading: false };
  mocks.rows = {};
});

describe('useIntentLocation region ladder', () => {
  it('uses the region picked on the homepage when no ?city= is given', async () => {
    pick('lis', 'Lisbon');
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cityName).toBe('Lisbon');
    expect(result.current.countryCode).toBe('PT');
    expect(result.current.inferred).toBe(false);
  });

  it('falls back to the profile home city', async () => {
    mocks.prefs = { data: { home_city_id: 'zrh' }, isLoading: false };
    mocks.rows.zrh = row('zrh', 'Zurich', 'CH');
    const { result } = render();
    await waitFor(() => expect(result.current.cityName).toBe('Zurich'));
    expect(result.current.loading).toBe(false);
  });

  it('lets an explicit ?city= win and never stores it as the region', async () => {
    pick('lis', 'Lisbon');
    mocks.rows.berlin = row('ber', 'Berlin', 'DE');
    const before = sessionStorage.getItem('qg_home_region');
    const { result } = render('berlin');
    await waitFor(() => expect(result.current.cityName).toBe('Berlin'));
    expect(sessionStorage.getItem('qg_home_region')).toBe(before);
  });

  it('ipOnly ignores both rungs (useHomeRegion runs its own ladder)', async () => {
    pick('lis', 'Lisbon');
    mocks.prefs = { data: { home_city_id: 'zrh' }, isLoading: false };
    const { result } = render(null, { ipOnly: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cityName).toBeNull();
  });
});
