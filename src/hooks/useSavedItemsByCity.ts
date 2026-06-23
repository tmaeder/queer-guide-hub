import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { resolveEntityGeo, type EntityGeo } from '@/lib/trips/resolveEntityGeo';
import { fetchTripSuggestionCities } from '@/hooks/useTripSuggestions';

export interface SavedCityGroup {
  cityId: string;
  cityName: string;
  countryId: string | null;
  countryName: string | null;
  equalityScore: number | null;
  items: EntityGeo[];
}

/**
 * Groups the user's saved venues/events by city so the Saved surface can offer
 * "you saved N places in Barcelona → build a trip". Reads the `saved_items`
 * view (security_invoker → RLS scopes to the current user), resolves geo via
 * the shared {@link resolveEntityGeo}, and only returns cities with ≥2 saves
 * (a single save isn't worth a banner — the per-item "Add to a trip" covers it).
 */
export function useSavedItemsByCity() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['saved-items-by-city', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SavedCityGroup[]> => {
      const { data: saved, error } = await supabase
        .from('saved_items')
        .select('entity_type, entity_id')
        .eq('user_id', user!.id)
        .in('entity_type', ['venue', 'event']);
      if (error) throw error;

      const refs = (saved ?? [])
        .map((r) => ({ type: r.entity_type as 'venue' | 'event', id: r.entity_id as string }))
        .filter((r) => r.id);
      if (refs.length === 0) return [];

      const geoMap = await resolveEntityGeo(refs);

      // Group resolved items by city.
      const byCity = new Map<string, EntityGeo[]>();
      for (const geo of geoMap.values()) {
        if (!geo.city_id) continue;
        const list = byCity.get(geo.city_id) ?? [];
        list.push(geo);
        byCity.set(geo.city_id, list);
      }

      const cityIds = Array.from(byCity.keys()).filter((id) => (byCity.get(id)?.length ?? 0) >= 2);
      if (cityIds.length === 0) return [];

      const cities = await fetchTripSuggestionCities(cityIds);
      const cityMeta = new Map(cities.map((c) => [c.id, c]));

      return cityIds
        .map((cityId) => {
          const items = byCity.get(cityId) ?? [];
          const meta = cityMeta.get(cityId);
          return {
            cityId,
            cityName: meta?.name ?? items[0]?.name ?? 'Unknown city',
            countryId: meta?.country_id ?? items[0]?.country_id ?? null,
            countryName: meta?.countries?.name ?? null,
            equalityScore: meta?.countries?.equality_score ?? null,
            items,
          };
        })
        .sort((a, b) => b.items.length - a.items.length);
    },
  });
}
