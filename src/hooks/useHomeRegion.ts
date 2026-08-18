import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { useDerivedTravelIntent } from '@/hooks/useUserIntent';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Where the current region came from. Drives the chip's wording. */
export type RegionSource = 'override' | 'trip' | 'profile' | 'ip' | 'none';

export interface RegionValue {
  cityId: string | null;
  citySlug: string | null;
  cityName: string | null;
  countryId: string | null;
  countryCode: string | null;
  countryName: string | null;
}

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

const STORAGE_KEY = 'qg_home_region';
/** An override is a correction for *this visit*, not a saved preference. */
const OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000;

/** Same-tab change notification — `storage` events only fire cross-tab, and
 *  the chip and the bands are separate mounts of this hook in one document. */
export const REGION_EVENT = 'qg-home-region-changed';

interface StoredOverride extends RegionValue {
  ts: number;
}

/**
 * Read the session override.
 *
 * sessionStorage, deliberately:
 *  - not the URL — a shared `queer.guide/` link must not carry where the
 *    sharer was standing. (This is why the homepage does NOT pass a `?city=`
 *    through to `useIntentLocation`, which honours one on intent pages.)
 *  - not localStorage — a long-lived record of "this device is in <country>"
 *    is exactly the forensic trace this product must not leave, and the same
 *    reasoning already keeps coordinates out of web storage entirely.
 *  - not react-query alone — its cache dies on a hard reload, so a correction
 *    made seconds ago would silently revert, which reads as a broken control.
 *
 * Coordinates are NEVER stored here — only the resolved city/country identity.
 */
function readOverride(): RegionValue | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOverride;
    if (!parsed?.cityId || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > OVERRIDE_TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      cityId: parsed.cityId,
      citySlug: parsed.citySlug ?? null,
      cityName: parsed.cityName ?? null,
      countryId: parsed.countryId ?? null,
      countryCode: parsed.countryCode ?? null,
      countryName: parsed.countryName ?? null,
    };
  } catch {
    return null;
  }
}

function writeOverride(value: RegionValue | null) {
  try {
    if (!value) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, ts: Date.now() }));
  } catch {
    /* private mode — the override simply does not persist */
  }
}

const CITY_IDENTITY_SELECT = 'id, name, slug, countries:country_id(id, code, name)';

type CityIdentityRow = {
  id: string;
  name: string;
  slug: string | null;
  countries?: { id?: string; code?: string; name?: string } | null;
};

function toRegionValue(row: CityIdentityRow | null): RegionValue | null {
  if (!row) return null;
  return {
    cityId: row.id,
    citySlug: row.slug ?? null,
    cityName: row.name,
    countryId: row.countries?.id ?? null,
    countryCode: row.countries?.code ?? null,
    countryName: row.countries?.name ?? null,
  };
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

/** Resolve a bare city id to the identity fields the bands need. */
function useCityIdentity(cityId: string | null | undefined) {
  return useQuery({
    queryKey: ['home-region-city', cityId],
    enabled: !!cityId,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<RegionValue | null> => {
      const { data } = await supabase
        .from('cities')
        .select(CITY_IDENTITY_SELECT)
        .eq('id', cityId!)
        .maybeSingle();
      return toRegionValue(data as CityIdentityRow | null);
    },
  });
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
 * homepage's region (see readOverride).
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

  const ip = useIntentLocation(null);
  const { data: prefs, isLoading: prefsLoading } = useUserTravelPreferences();
  const { data: trip, isLoading: tripLoading } = useDerivedTravelIntent(!override);

  const tripCityId = override ? null : (trip?.cityId ?? null);
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
