import { useEffect, useState } from 'react';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { supabase } from '@/integrations/supabase/client';

export interface IntentLocation {
  cityId: string | null;
  citySlug: string | null;
  cityName: string | null;
  countryCode: string | null;
  loading: boolean;
  /** True when the city came from IP geolocation rather than an explicit URL. */
  inferred: boolean;
}

/**
 * Resolve the city an intent page should open on, without ever prompting.
 *
 * Order: explicit `?city=<slug>` → IP city (via the same-origin `/api/geo`
 * Pages Function that `useVisitorLocation` already uses) → nothing.
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
 * `navigator.geolocation` call sites, `useGeoCountry`/`useUserCountry`).
 * Consolidating those is a separate piece of work and this must not depend on it.
 */
export function useIntentLocation(citySlugParam?: string | null): IntentLocation {
  const { location, loading: geoLoading } = useVisitorLocation();
  const [resolved, setResolved] = useState<IntentLocation>({
    cityId: null,
    citySlug: null,
    cityName: null,
    countryCode: null,
    loading: true,
    inferred: false,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Explicit slug in the URL always wins.
      if (citySlugParam) {
        const { data } = await supabase
          .from('cities')
          .select('id, name, slug, countries:country_id(code)')
          .eq('slug', citySlugParam)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          const country = (data as { countries?: { code?: string | null } | null }).countries;
          setResolved({
            cityId: data.id as string,
            citySlug: data.slug as string,
            cityName: data.name as string,
            countryCode: country?.code ?? null,
            loading: false,
            inferred: false,
          });
          return;
        }
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
              .select('id, name, slug, countries:country_id(code)')
              .eq('country_id', countryRow.id as string)
              .ilike('name', cityName)
              .not('slug', 'is', null)
              .order('population', { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle()
          : { data: null };
        if (cancelled) return;
        if (data) {
          const country = (data as { countries?: { code?: string | null } | null }).countries;
          setResolved({
            cityId: data.id as string,
            citySlug: data.slug as string,
            cityName: data.name as string,
            countryCode: country?.code ?? location?.country ?? null,
            loading: false,
            inferred: true,
          });
          return;
        }
      }

      if (cancelled) return;
      setResolved({
        cityId: null,
        citySlug: null,
        cityName: null,
        countryCode: location?.country ?? null,
        loading: false,
        inferred: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [citySlugParam, geoLoading, location?.city, location?.country]);

  return resolved;
}
