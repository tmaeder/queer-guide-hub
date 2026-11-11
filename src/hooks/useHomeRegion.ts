import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { useDerivedTravelIntent } from '@/hooks/useUserIntent';
import { supabase } from '@/integrations/supabase/client';
import {
  CITY_IDENTITY_SELECT,
  REGION_EVENT,
  readOverride,
  toRegionValue,
  useCityIdentity,
  writeOverride,
  type CityIdentityRow,
  type RegionValue,
} from '@/hooks/regionOverride';

export { REGION_EVENT, type RegionValue };

/** Where the current region came from. Drives the chip's wording. */
export type RegionSource = 'override' | 'trip' | 'profile' | 'ip' | 'none';

export interface HomeRegion extends RegionValue {
  source: RegionSource;
  loading: boolean;
  /** True when we guessed rather than being told. The chip says "Near X". */
  inferred: boolean;
}

export interface HomeRegionApi extends HomeRegion {
  /** Pass null to fall back to the automatic ladder ("use my area"). */
  setRegion: (next: RegionValue | null) => void;
}

/** Resolve a city slug to the identity the ladder stores. Lives here rather
 *  than in the chip component: `supabase.from()` belongs in `src/hooks/`. */
export async function resolveRegionBySlug(slug: string): Promise<RegionValue | null> {
  const { data } = await supabase
    .from('cities')
    .select(CITY_IDENTITY_SELECT)
    .eq('slug', slug)
    .maybeSingle();
  return toRegionValue(data as CityIdentityRow | null);
}

/**
 * Which region the homepage is showing, and how sure we are.
 *
 * Ladder — first non-null wins:
 *   1. override — what the visitor picked in the region chip this session
 *   2. trip     — the city of their next trip (a traveller wants Lisbon, not home)
 *   3. profile  — user_travel_preferences.home_city_id
 *   4. ip       — the coarse CF edge city, via useIntentLocation
 *   5. none     — the page goes global and the chip becomes an invitation
 *
 * `profiles.location` is deliberately NOT a rung: it is free text, and
 * resolving arbitrary strings to city rows reopens the same-name collision
 * (Portland ME vs Portland OR) that useIntentLocation exists to close.
 *
 * This WRAPS useIntentLocation rather than reimplementing IP resolution —
 * that hook is live on four other routes and owns the country-match guard.
 * It is called with no slug so a `?city=` in the URL can never become the
 * homepage's region (see readOverride), and with `ipOnly` because this hook
 * runs the override and profile rungs itself (with trip between them).
 */
export function useHomeRegion(): HomeRegionApi {
  const [override, setOverride] = useState<RegionValue | null>(() =>
    typeof window === 'undefined' ? null : readOverride(),
  );

  // Other mounts of this hook (the chip and the bands) must agree instantly.
  useEffect(() => {
    const sync = () => setOverride(readOverride());
    window.addEventListener(REGION_EVENT, sync);
    return () => window.removeEventListener(REGION_EVENT, sync);
  }, []);

  const ip = useIntentLocation(null, { ipOnly: true });
  const { data: prefs, isLoading: prefsLoading } = useUserTravelPreferences();
  const { data: trip, isLoading: tripLoading } = useDerivedTravelIntent(!override);

  // Only a dated, current-or-upcoming trip outranks home: the RPC also returns
  // undated wishlist trips (no end date never expires), which would otherwise
  // pin the homepage to that city indefinitely.
  const today = new Date().toISOString().slice(0, 10);
  const tripIsLive = !!trip?.startDate && (trip.endDate ?? trip.startDate) >= today;
  const tripCityId = override || !tripIsLive ? null : (trip?.cityId ?? null);
  const profileCityId = override || tripCityId ? null : (prefs?.home_city_id ?? null);
  const { data: tripCity, isLoading: tripCityLoading } = useCityIdentity(tripCityId);
  const { data: profileCity, isLoading: profileCityLoading } = useCityIdentity(profileCityId);

  const setRegion = useCallback((next: RegionValue | null) => {
    writeOverride(next);
    setOverride(next);
    // Same-tab listeners: `storage` only fires cross-tab.
    window.dispatchEvent(new Event(REGION_EVENT));
  }, []);

  return useMemo<HomeRegionApi>(() => {
    if (override) {
      return { ...override, source: 'override', inferred: false, loading: false, setRegion };
    }

    const loading =
      ip.loading || prefsLoading || tripLoading || tripCityLoading || profileCityLoading;

    if (tripCity) {
      return { ...tripCity, source: 'trip', inferred: true, loading: false, setRegion };
    }
    if (profileCity) {
      return { ...profileCity, source: 'profile', inferred: false, loading: false, setRegion };
    }
    if (!loading && (ip.cityId || ip.countryId)) {
      return {
        cityId: ip.cityId,
        citySlug: ip.citySlug,
        cityName: ip.cityName,
        countryId: ip.countryId,
        countryCode: ip.countryCode,
        countryName: null,
        source: 'ip',
        inferred: true,
        loading: false,
        setRegion,
      };
    }

    return {
      cityId: null,
      citySlug: null,
      cityName: null,
      countryId: null,
      countryCode: null,
      countryName: null,
      source: 'none',
      inferred: false,
      loading,
      setRegion,
    };
  }, [
    override,
    ip.loading,
    ip.cityId,
    ip.citySlug,
    ip.cityName,
    ip.countryId,
    ip.countryCode,
    prefsLoading,
    tripLoading,
    tripCity,
    tripCityLoading,
    profileCity,
    profileCityLoading,
    setRegion,
  ]);
}
