import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null };
const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));

import {
  fetchProfileTravelPreferences,
  fetchTravelPrefsHomeCity,
  saveProfileTravelPreferences,
} from '../useTravelPreferencesEditor';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('fetchProfileTravelPreferences', () => {
  it('returns the travel_preferences object', async () => {
    withResults({ data: { travel_preferences: { budget_level: 'mid' } }, error: null });
    const r = await fetchProfileTravelPreferences('u1');
    expect(r?.budget_level).toBe('mid');
  });

  it('returns null when no row', async () => {
    withResults({ data: null, error: null });
    expect(await fetchProfileTravelPreferences('u1')).toBeNull();
  });
});

describe('fetchTravelPrefsHomeCity', () => {
  it('builds the home-city descriptor from joined data', async () => {
    withResults({
      data: {
        id: 'c1', name: 'Berlin', timezone: 'Europe/Berlin',
        country: { id: 'co1', name: 'Germany', code: 'DE' },
      },
      error: null,
    });
    const r = await fetchTravelPrefsHomeCity('c1');
    expect(r).toEqual({
      cityId: 'c1', cityName: 'Berlin', countryId: 'co1', countryName: 'Germany',
      countryCode: 'DE', timezone: 'Europe/Berlin',
    });
  });

  it('returns null when no row or no country', async () => {
    withResults({ data: null, error: null });
    expect(await fetchTravelPrefsHomeCity('c1')).toBeNull();

    withResults({ data: { id: 'c1', name: 'X', country: null }, error: null });
    expect(await fetchTravelPrefsHomeCity('c1')).toBeNull();
  });
});

describe('saveProfileTravelPreferences', () => {
  it('updates profiles.travel_preferences for user', async () => {
    withResults({ data: null, error: null });
    await saveProfileTravelPreferences('u1', {
      budget_level: 'high', safety_threshold: 7, preferred_accommodation: ['hotel'],
      interests: ['food'], travel_style: 'cultural', accessibility_needs: [],
    });
    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect((update?.args[0] as Record<string, unknown>).travel_preferences).toBeDefined();
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['user_id', 'u1']);
  });

  it('throws on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(
      saveProfileTravelPreferences('u1', {
        budget_level: 'low', safety_threshold: 1, preferred_accommodation: [],
        interests: [], travel_style: 'x', accessibility_needs: [],
      }),
    ).rejects.toEqual({ message: 'rls' });
  });
});
