import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  importBbox,
  matchPlacesToVenues,
  type CandidateVenue,
  type PlaceMatch,
} from '@/lib/import/matchPlaces';
import type { ParsedPlace } from '@/lib/import/parsePlacesFile';

/**
 * Matches parsed import places against existing venues in one padded
 * bounding-box query (capped at 2000 candidates — plenty for the one-city
 * imports this feature targets).
 */
export function useImportVenueMatches(places: ParsedPlace[]) {
  const bbox = importBbox(places);
  const key = places.map((p) => `${p.name}@${p.lat},${p.lng}`).join('|');

  return useQuery({
    queryKey: ['import-venue-matches', key],
    enabled: places.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PlaceMatch[]> => {
      if (!bbox) return places.map((place) => ({ place, venue: null }));
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, latitude, longitude, city_id, country_id')
        .gte('latitude', bbox.minLat)
        .lte('latitude', bbox.maxLat)
        .gte('longitude', bbox.minLng)
        .lte('longitude', bbox.maxLng)
        .is('duplicate_of_id', null)
        .limit(2000);
      if (error) throw error;
      return matchPlacesToVenues(places, (data ?? []) as CandidateVenue[]);
    },
  });
}
