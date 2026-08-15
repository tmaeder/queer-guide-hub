/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { TestProviders } from '@/test/test-utils';

const mocks = vi.hoisted(() => ({
  intent: {
    cityId: null as string | null,
    citySlug: null as string | null,
    cityName: null as string | null,
    countryCode: null as string | null,
    countryId: null as string | null,
    loading: false,
    inferred: false,
  },
  prefs: { data: null as { home_city_id: string | null } | null, isLoading: false },
  trip: { data: null as { cityId: string | null } | null, isLoading: false },
  cityRows: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/useIntentLocation', () => ({
  useIntentLocation: () => mocks.intent,
}));
vi.mock('@/hooks/useUserTravelPreferences', () => ({
  useUserTravelPreferences: () => mocks.prefs,
}));
vi.mock('@/hooks/useUserIntent', () => ({
  useDerivedTravelIntent: () => mocks.trip,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => ({ data: mocks.cityRows[val] ?? null }),
        }),
      }),
    }),
  },
}));

import { useHomeRegion } from '../useHomeRegion';

const cityRow = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  countries: { id: `c-${id}`, code: 'DE', name: 'Germany' },
});

function render() {
  return renderHook(() => useHomeRegion(), { wrapper: TestProviders });
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.intent = {
    cityId: null,
    citySlug: null,
    cityName: null,
    countryCode: null,
    countryId: null,
    loading: false,
    inferred: false,
  };
  mocks.prefs = { data: null, isLoading: false };
  mocks.trip = { data: null, isLoading: false };
  mocks.cityRows = {};
});

describe('useHomeRegion ladder', () => {
  it('falls back to IP when nothing else is known', async () => {
    mocks.intent = {
      cityId: 'ip-1',
      citySlug: 'berlin',
      cityName: 'Berlin',
      countryCode: 'DE',
      countryId: 'de',
      loading: false,
      inferred: true,
    };
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('ip');
    expect(result.current.cityName).toBe('Berlin');
    // "Near Berlin" — the chip must say we guessed.
    expect(result.current.inferred).toBe(true);
  });

  it('prefers the profile home city over IP', async () => {
    mocks.intent = { ...mocks.intent, cityId: 'ip-1', cityName: 'Berlin', countryId: 'de' };
    mocks.prefs = { data: { home_city_id: 'home-1' }, isLoading: false };
    mocks.cityRows['home-1'] = cityRow('home-1', 'Hamburg');

    const { result } = render();
    await waitFor(() => expect(result.current.source).toBe('profile'));
    expect(result.current.cityName).toBe('Hamburg');
    // Told, not guessed — the chip drops "Near".
    expect(result.current.inferred).toBe(false);
  });

  it('prefers the next trip over the profile home city', async () => {
    mocks.prefs = { data: { home_city_id: 'home-1' }, isLoading: false };
    mocks.trip = { data: { cityId: 'trip-1' }, isLoading: false };
    mocks.cityRows['home-1'] = cityRow('home-1', 'Hamburg');
    mocks.cityRows['trip-1'] = cityRow('trip-1', 'Lisbon');

    const { result } = render();
    await waitFor(() => expect(result.current.source).toBe('trip'));
    expect(result.current.cityName).toBe('Lisbon');
  });

  it('lets an explicit override beat every automatic rung', async () => {
    mocks.intent = { ...mocks.intent, cityId: 'ip-1', cityName: 'Berlin', countryId: 'de' };
    mocks.trip = { data: { cityId: 'trip-1' }, isLoading: false };
    mocks.cityRows['trip-1'] = cityRow('trip-1', 'Lisbon');

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setRegion({
        cityId: 'ov-1',
        citySlug: 'madrid',
        cityName: 'Madrid',
        countryId: 'es',
        countryCode: 'ES',
        countryName: 'Spain',
      });
    });

    await waitFor(() => expect(result.current.source).toBe('override'));
    expect(result.current.cityName).toBe('Madrid');
    expect(result.current.inferred).toBe(false);
  });

  it('reports source "none" and stays unloaded-but-settled when nothing resolves', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('none');
    expect(result.current.cityId).toBeNull();
  });

  it('keeps a country even when the city does not resolve', async () => {
    mocks.intent = { ...mocks.intent, cityId: null, countryId: 'de', countryCode: 'DE' };
    const { result } = render();
    await waitFor(() => expect(result.current.source).toBe('ip'));
    expect(result.current.countryId).toBe('de');
    expect(result.current.cityId).toBeNull();
  });
});

describe('useHomeRegion override storage', () => {
  const override = {
    cityId: 'ov-1',
    citySlug: 'madrid',
    cityName: 'Madrid',
    countryId: 'es',
    countryCode: 'ES',
    countryName: 'Spain',
  };

  it('survives a remount (sessionStorage, not react-query cache)', async () => {
    const first = render();
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    act(() => first.result.current.setRegion(override));
    await waitFor(() => expect(first.result.current.source).toBe('override'));

    // A hard reload drops the query cache; a correction made seconds ago must
    // not silently revert, which would read as a broken control.
    first.unmount();
    const second = render();
    await waitFor(() => expect(second.result.current.source).toBe('override'));
    expect(second.result.current.cityName).toBe('Madrid');
  });

  it('NEVER writes the region to the URL', async () => {
    const before = window.location.href;
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setRegion(override));
    await waitFor(() => expect(result.current.source).toBe('override'));
    // A shared queer.guide/ link must not carry where the sharer was standing.
    expect(window.location.href).toBe(before);
    expect(window.location.search).not.toContain('madrid');
  });

  it('stores no coordinates', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setRegion(override));
    await waitFor(() => expect(result.current.source).toBe('override'));
    const raw = sessionStorage.getItem('qg_home_region') ?? '';
    expect(raw).not.toContain('latitude');
    expect(raw).not.toContain('longitude');
  });

  it('uses sessionStorage, never localStorage', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setRegion(override));
    await waitFor(() => expect(result.current.source).toBe('override'));
    expect(sessionStorage.getItem('qg_home_region')).toBeTruthy();
    expect(localStorage.getItem('qg_home_region')).toBeNull();
  });

  it('ignores an override older than its TTL', async () => {
    sessionStorage.setItem(
      'qg_home_region',
      JSON.stringify({ ...override, ts: Date.now() - 13 * 60 * 60 * 1000 }),
    );
    mocks.intent = { ...mocks.intent, cityId: 'ip-1', cityName: 'Berlin', countryId: 'de' };
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('ip');
    expect(result.current.cityName).toBe('Berlin');
  });

  it('setRegion(null) returns to the automatic ladder', async () => {
    mocks.intent = { ...mocks.intent, cityId: 'ip-1', cityName: 'Berlin', countryId: 'de' };
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setRegion(override));
    await waitFor(() => expect(result.current.source).toBe('override'));

    act(() => result.current.setRegion(null));
    await waitFor(() => expect(result.current.source).toBe('ip'));
    expect(sessionStorage.getItem('qg_home_region')).toBeNull();
  });
});
