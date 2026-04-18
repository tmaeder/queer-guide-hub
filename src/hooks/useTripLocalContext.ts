import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TripWithDetails } from '@/hooks/useTrips';

export interface LocalPersonality {
  id: string;
  name: string;
  profession: string | null;
  image_url: string | null;
  lgbti_connection: string | null;
  slug: string | null;
  city?: { id: string; name: string } | null;
}

export interface LocalVillage {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  featured: boolean | null;
  city?: { id: string; name: string } | null;
}

export interface TripLocalContext {
  personalities: LocalPersonality[];
  villages: LocalVillage[];
}

/**
 * For every city present on a trip, surface up to a handful of
 * notable LGBTQ+ personalities and queer neighborhoods (villages).
 * This is the "Plan tab → discover local context" data source:
 * it lets a trip page feel connected to the rest of the platform
 * without the user having to go looking.
 *
 * Empty arrays when the trip has no city-resolved places yet.
 */
export function useTripLocalContext(trip: TripWithDetails | undefined) {
  const cityIds = Array.from(
    new Set(
      (trip?.trip_places ?? [])
        .map((p) => p.city_id)
        .filter((id): id is string => !!id),
    ),
  );

  return useQuery({
    queryKey: ['trip-local-context', trip?.id, cityIds],
    enabled: !!trip && cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<TripLocalContext> => {
      const [personalitiesRes, villagesRes] = await Promise.all([
        supabase
          .from('personalities')
          .select('id, name, profession, image_url, lgbti_connection, slug, city:city_id(id, name)')
          .in('city_id', cityIds)
          .eq('visibility', 'public')
          .order('view_count', { ascending: false, nullsFirst: false })
          .limit(6),
        supabase
          .from('queer_villages')
          .select('id, name, description, slug, featured, city:city_id(id, name)')
          .in('city_id', cityIds)
          .order('featured', { ascending: false })
          .limit(4),
      ]);

      if (personalitiesRes.error) throw personalitiesRes.error;
      if (villagesRes.error) throw villagesRes.error;

      return {
        personalities: (personalitiesRes.data ?? []) as unknown as LocalPersonality[],
        villages: (villagesRes.data ?? []) as unknown as LocalVillage[],
      };
    },
  });
}
