import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The region override the homepage chip writes, plus the city-identity lookup
 * both region hooks use. Its own module so `useIntentLocation` (intent pages)
 * and `useHomeRegion` (homepage) read ONE implementation without importing
 * each other.
 */

export interface RegionValue {
  cityId: string | null;
  citySlug: string | null;
  cityName: string | null;
  countryId: string | null;
  countryCode: string | null;
  countryName: string | null;
}

export const STORAGE_KEY = 'qg_home_region';
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
export function readOverride(): RegionValue | null {
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

export function writeOverride(value: RegionValue | null) {
  try {
    if (!value) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, ts: Date.now() }));
  } catch {
    /* private mode — the override simply does not persist */
  }
}

export const CITY_IDENTITY_SELECT = 'id, name, slug, countries:country_id(id, code, name)';

export type CityIdentityRow = {
  id: string;
  name: string;
  slug: string | null;
  countries?: { id?: string; code?: string; name?: string } | null;
};

export function toRegionValue(row: CityIdentityRow | null): RegionValue | null {
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

/** Resolve a bare city id to the identity fields the bands need. */
export function useCityIdentity(cityId: string | null | undefined) {
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
