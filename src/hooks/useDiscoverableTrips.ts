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
  trip_places: Array<{
    cities: { name: string } | null;
    countries: { name: string } | null;
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
      const { data, error } = await supabase
        .from('trips')
        .select(
          `id, title, description, start_date, end_date, cover_image_url, owner_id, created_at,
           trip_places(cities:city_id(name), countries:country_id(name)),
           owner:profiles!owner_id(display_name, avatar_url)`,
        )
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;

      const lowered = trimmed.toLowerCase();
      const trips = ((data ?? []) as unknown as RawTrip[])
        .map((t): DiscoverableTrip => {
          const cities = new Set<string>();
          const countries = new Set<string>();
          for (const p of t.trip_places ?? []) {
            if (p.cities?.name) cities.add(p.cities.name);
            if (p.countries?.name) countries.add(p.countries.name);
          }
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
