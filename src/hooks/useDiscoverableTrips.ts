import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DiscoverableTrip {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  owner_id: string;
  created_at: string;
  cities: string[];
  countries: string[];
  place_count: number;
  primary_city_id: string | null;
  primary_country_id: string | null;
  /** Minimum equality score across countries on the trip (null if unknown). */
  min_equality_score: number | null;
  is_staff_pick: boolean;
  fork_count: number;
  save_count: number;
  primary_city_name: string | null;
  primary_city_lat: number | null;
  primary_city_lng: number | null;
  duration_days: number;
  owner: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface RawTrip {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  owner_id: string;
  created_at: string;
  primary_city_id: string | null;
  primary_country_id: string | null;
  is_staff_pick?: boolean | null;
  fork_count?: number | null;
  save_count?: number | null;
  primary_city?: {
    name: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  trip_places: Array<{
    cities: { name: string } | null;
    countries: { name: string; equality_score: number | null } | null;
  }>;
  owner: { display_name: string | null; avatar_url: string | null } | null;
}

/**
 * Public-trip discovery feed. Reads trips with `is_public=true` (RLS
 * already permits anon SELECT for those), joins city + country names
 * from `trip_places`, and aggregates them into per-trip arrays.
 *
 * Optional `cityFilter` does a case-insensitive substring match on
 * the joined city name — when set, the query only returns trips
 * containing at least one place in a matching city.
 */
export function useDiscoverableTrips(cityFilter?: string) {
  const trimmed = cityFilter?.trim() ?? '';
  return useQuery({
    queryKey: ['discoverable-trips', trimmed.toLowerCase()],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DiscoverableTrip[]> => {
      // Three-tier query: full → no-owner → no-discover-signals.
      // Tier 3 handles the case where the discover-signals migration
      // (is_staff_pick / fork_count / save_count) hasn't been applied yet.
      const BASE_COLS =
        'id, title, description, start_date, end_date, cover_image_url, owner_id, created_at, primary_city_id, primary_country_id';
      const SIGNAL_COLS = 'is_staff_pick, fork_count, save_count';
      const NESTED =
        'trip_places(cities:city_id(name), countries:country_id(name, equality_score)), primary_city:cities!primary_city_id(name, latitude, longitude)';

      const runQuery = (cols: string) =>
        supabase
          .from('trips')
          .select(cols)
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(60);

      const withOwner = await runQuery(
        `${BASE_COLS}, ${SIGNAL_COLS}, ${NESTED}, owner:profiles!owner_id(display_name, avatar_url)`,
      );

      let data = withOwner.data;
      if (withOwner.error) {
        console.warn(
          '[useDiscoverableTrips] full query failed, retrying without owner embed',
          withOwner.error,
        );
        const noOwner = await runQuery(`${BASE_COLS}, ${SIGNAL_COLS}, ${NESTED}`);
        if (noOwner.error) {
          console.warn(
            '[useDiscoverableTrips] retrying without discover-signal columns',
            noOwner.error,
          );
          const minimal = await runQuery(`${BASE_COLS}, ${NESTED}`);
          if (minimal.error) throw minimal.error;
          data = (minimal.data ?? []).map((t) => ({ ...t, owner: null }));
        } else {
          data = (noOwner.data ?? []).map((t) => ({ ...t, owner: null }));
        }
      }

      const lowered = trimmed.toLowerCase();
      const trips = ((data ?? []) as unknown as RawTrip[])
        .map((t): DiscoverableTrip => {
          const cities = new Set<string>();
          const countries = new Set<string>();
          const scores: number[] = [];
          for (const p of t.trip_places ?? []) {
            if (p.cities?.name) cities.add(p.cities.name);
            if (p.countries?.name) countries.add(p.countries.name);
            if (typeof p.countries?.equality_score === 'number') {
              scores.push(p.countries.equality_score);
            }
          }
          const duration =
            t.start_date && t.end_date
              ? Math.max(
                  0,
                  Math.round(
                    (new Date(t.end_date).getTime() -
                      new Date(t.start_date).getTime()) /
                      (24 * 60 * 60 * 1000),
                  ) + 1,
                )
              : 0;
          return {
            id: t.id,
            title: t.title,
            description: t.description,
            start_date: t.start_date,
            end_date: t.end_date,
            cover_image_url: t.cover_image_url,
            owner_id: t.owner_id,
            created_at: t.created_at,
            cities: [...cities],
            countries: [...countries],
            place_count: (t.trip_places ?? []).length,
            primary_city_id: t.primary_city_id,
            primary_country_id: t.primary_country_id,
            min_equality_score: scores.length ? Math.min(...scores) : null,
            is_staff_pick: !!t.is_staff_pick,
            fork_count: t.fork_count ?? 0,
            save_count: t.save_count ?? 0,
            primary_city_name: t.primary_city?.name ?? null,
            primary_city_lat: t.primary_city?.latitude ?? null,
            primary_city_lng: t.primary_city?.longitude ?? null,
            duration_days: duration,
            owner: t.owner,
          };
        })
        .filter((t) => {
          if (!lowered) return true;
          return t.cities.some((c) => c.toLowerCase().includes(lowered));
        });

      return trips;
    },
  });
}
