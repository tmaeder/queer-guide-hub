import { useEffect, useMemo, useState } from 'react';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import {
  REGION_EVENT,
  readOverride,
  useCityIdentity,
  type RegionValue,
} from '@/hooks/regionOverride';
import { supabase } from '@/integrations/supabase/client';

export interface IntentLocation {
  cityId: string | null;
  citySlug: string | null;
  cityName: string | null;
  countryCode: string | null;
  /** `countries.id` for the resolved country. Both country lookups below
   *  already read the row; before this the id was fetched and thrown away, so
   *  every caller that scopes a query by country had to re-resolve the ISO
   *  code to a UUID. Additive — existing consumers destructure by name. */
  countryId: string | null;
  error?: 'unavailable';
  retry?: () => void;
  loading: boolean;
  /** True when the city came from IP geolocation rather than an explicit URL. */
  inferred: boolean;
}

/**
 * Resolve the city an intent page should open on, without ever prompting.
 *
 * Order: explicit `?city=<slug>` → the region the visitor picked in the
 * homepage chip this session (`readOverride`) → their profile home city →
 * IP city (via the same-origin `/api/geo` Pages Function that
 * `useVisitorLocation` already uses) → nothing.
 *
 * The override and profile rungs are what keep a picked region from being
 * lost the moment the visitor leaves the homepage. Neither is written here:
 * a `?city=` is never promoted into the override, and no coordinates are
 * stored anywhere. `ipOnly` skips both for `useHomeRegion`, which runs its
 * own ladder (with the trip rung between them) on top of this one.
 *
 * Two deliberate choices:
 *
 *  - **No `navigator.geolocation` on load.** A permission prompt on first paint
 *    is hostile, and for a queer travel product it asks people in criminalising
 *    countries to hand over their position before they have any reason to trust
 *    us. IP city is coarse and free. `useEventFilters` already sets this
 *    precedent by seeding its city filter from `useVisitorLocation`.
 *  - **The inferred city is never written to the URL.** A bare `/going-out`
 *    must stay shareable without leaking where the sharer was standing.
 *
 * This wraps `useVisitorLocation` rather than joining the four existing geo
 * implementations (`useNearMe`, `useVisitorLocation`, three inline
 * `navigator.geolocation` call sites, `useGeoCountry`).
 * Consolidating those is a separate piece of work and this must not depend on it.
 */
export function useIntentLocation(
  citySlugParam?: string | null,
  { ipOnly = false, cityId: explicitCityId }: { ipOnly?: boolean; cityId?: string } = {},
): IntentLocation {
  const { location, loading: geoLoading } = useVisitorLocation();
  const layered = !ipOnly && !citySlugParam && !explicitCityId;
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${citySlugParam ?? ''}|${explicitCityId ?? ''}|${attempt}`;
  const [override, setOverride] = useState<RegionValue | null>(() =>
    layered && typeof window !== 'undefined' ? readOverride() : null,
  );
  // A pick made elsewhere in the tab (the homepage chip, the /going-out chip)
  // applies at once rather than on the next mount.
  useEffect(() => {
    if (!layered) return;
    const sync = () => setOverride(readOverride());
    window.addEventListener(REGION_EVENT, sync);
    return () => window.removeEventListener(REGION_EVENT, sync);
  }, [layered]);
  const { data: prefs, isLoading: prefsLoading } = useUserTravelPreferences();
  const profileCityId = layered && !override ? (prefs?.home_city_id ?? null) : null;
  const { data: profileCity, isLoading: profileCityLoading } = useCityIdentity(profileCityId);
  const [resolved, setResolved] = useState<IntentLocation & { requestKey: string }>({
    requestKey,
    cityId: null,
    citySlug: null,
    cityName: null,
    countryCode: null,
    countryId: null,
    loading: true,
    inferred: false,
  });

  useEffect(() => {
    let cancelled = false;
    const resolve = (value: IntentLocation) => setResolved({ ...value, requestKey });

    (async () => {
      // 1. Explicit slug in the URL always wins.
      if (citySlugParam || explicitCityId) {
        const select =
          'id, name, slug, country_id, duplicate_of_id, countries:country_id(id, code)';
        const query = supabase.from('cities').select(select);
        let { data } = await (
          citySlugParam ? query.eq('slug', citySlugParam) : query.eq('id', explicitCityId!)
        ).maybeSingle();
        if (cancelled) return;
        // Follow, do not reject: a merged city keeps its old slug and links to
        // it stay live, so the URL must resolve to the survivor rather than
        // fall through to inference. Same rule as `followMerged` in usePlaces.
        const mergedInto = (data as { duplicate_of_id?: string | null } | null)?.duplicate_of_id;
        if (mergedInto) {
          const survivor = await supabase
            .from('cities')
            .select(select)
            .eq('id', mergedInto)
            .maybeSingle();
          if (cancelled) return;
          data = survivor.data ?? data;
        }
        if (data) {
          const country = (
            data as { countries?: { id?: string | null; code?: string | null } | null }
          ).countries;
          resolve({
            cityId: data.id as string,
            citySlug: data.slug as string,
            cityName: data.name as string,
            countryCode: country?.code ?? null,
            countryId: country?.id ?? (data as { country_id?: string | null }).country_id ?? null,
            loading: false,
            inferred: false,
          });
          return;
        }
        resolve({
          cityId: null,
          citySlug: null,
          cityName: null,
          countryId: null,
          countryCode: null,
          loading: false,
          inferred: false,
          error: 'unavailable',
        });
        return;
      }

      // 2. Fall back to the IP city, but only once geo has settled.
      if (geoLoading) return;

      const cityName = location?.city ?? null;
      const countryCode = location?.country ?? null;

      // Resolve the country FIRST and require the city to sit inside it.
      //
      // Matching a city by name alone is the known same-name collision defect:
      // `cities` holds at most one row per (name, country), and ordering the
      // candidates by population descending actively prefers the bigger twin —
      // which is how Portland, Maine events were once attached to Portland,
      // Oregon. Here the consequence would be showing a visitor in Portland ME
      // the nightlife of a city 4,500 km away. The IP country is a second,
      // independent signal, so use it; if it is missing, decline to guess.
      if (cityName && countryCode) {
        const { data: countryRow } = await supabase
          .from('countries')
          .select('id, code')
          .ilike('code', countryCode)
          .maybeSingle();
        if (cancelled) return;

        const { data } = countryRow
          ? await supabase
              .from('cities')
              .select('id, name, slug, countries:country_id(id, code)')
              .is('duplicate_of_id', null)
              .eq('country_id', countryRow.id as string)
              .ilike('name', cityName)
              .not('slug', 'is', null)
              .order('population', { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle()
          : { data: null };
        if (cancelled) return;
        if (data) {
          const country = (
            data as { countries?: { id?: string | null; code?: string | null } | null }
          ).countries;
          resolve({
            cityId: data.id as string,
            citySlug: data.slug as string,
            cityName: data.name as string,
            countryCode: country?.code ?? location?.country ?? null,
            countryId: country?.id ?? (countryRow?.id as string | undefined) ?? null,
            loading: false,
            inferred: true,
          });
          return;
        }

        // The city did not resolve, but the COUNTRY did — keep it. A visitor in
        // a town we have no row for still gets country-scoped content instead
        // of falling all the way back to global.
        if (countryRow) {
          resolve({
            cityId: null,
            citySlug: null,
            cityName: null,
            countryCode: (countryRow.code as string | null) ?? location?.country ?? null,
            countryId: countryRow.id as string,
            loading: false,
            inferred: true,
          });
          return;
        }
      }

      if (cancelled) return;
      resolve({
        cityId: null,
        citySlug: null,
        cityName: null,
        countryCode: location?.country ?? null,
        countryId: null,
        loading: false,
        inferred: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [citySlugParam, explicitCityId, requestKey, geoLoading, location?.city, location?.country]);

  return useMemo<IntentLocation>(() => {
    if (!layered)
      return {
        ...resolved,
        loading: resolved.loading || resolved.requestKey !== requestKey,
        error: resolved.requestKey === requestKey ? resolved.error : undefined,
        retry: () => setAttempt((value) => value + 1),
      };
    const picked = override ?? profileCity ?? null;
    if (picked) {
      return {
        cityId: picked.cityId,
        citySlug: picked.citySlug,
        cityName: picked.cityName,
        countryCode: picked.countryCode,
        countryId: picked.countryId,
        loading: false,
        inferred: false,
      };
    }
    // Hold the IP answer until the profile rung has had its say, or a signed-in
    // visitor sees their IP city flash before their home city replaces it.
    const waiting = prefsLoading || profileCityLoading;
    return waiting ? { ...resolved, loading: true } : resolved;
  }, [layered, requestKey, resolved, override, profileCity, prefsLoading, profileCityLoading]);
}
