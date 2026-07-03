import { calculateDistanceKm } from '@/utils/calculateDistance';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NearbyCity {
  id: string;
  name: string;
  slug: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
  major_airport_code: string | null;
  is_major_city: boolean | null;
  is_capital: boolean | null;
  population: number | null;
  country_id: string | null;
  countries: { name: string | null; flag_emoji: string | null; equality_score: number | null } | null;
  /** Great-circle distance from the anchor city in km. */
  distance_km: number;
  /** Bucketed flight-time estimate. */
  bucket: 'short' | 'medium' | 'long';
}

interface Origin {
  cityId: string;
  latitude: number;
  longitude: number;
}

function bucket(km: number): NearbyCity['bucket'] {
  // assume ~800 km/h cruise + 1h overhead — these align with the
  // "<2h / 2–5h / 5h+" labels the editorial design calls for.
  if (km <= 800) return 'short';
  if (km <= 4000) return 'medium';
  return 'long';
}

/**
 * Returns the closest cities to the anchor by great-circle distance, capped
 * to `limit` per bucket. Excludes the anchor itself.
 */
export function useNearbyCities({ origin, limit = 9 }: { origin: Origin | null; limit?: number }) {
  return useQuery({
    queryKey: ['nearby-cities', origin?.cityId, limit],
    enabled: Boolean(origin),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<NearbyCity[]> => {
      if (!origin) return [];
      // Pull a candidate pool: every major city or capital with lat/long.
      // Tens of thousands of cities would be too much; this filter caps it
      // hard while keeping the picks high-quality (the user wants "next leg",
      // not "next village").
      const { data, error } = await supabase
        .from('cities')
        .select(
          'id, name, slug, latitude, longitude, image_url, major_airport_code, is_major_city, is_capital, population, country_id, countries(name, flag_emoji, equality_score)',
        )
        .or('is_major_city.eq.true,is_capital.eq.true')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .neq('id', origin.cityId)
        .limit(500);
      if (error) throw error;

      const scored = (data ?? [])
        .map((row) => {
          const d = calculateDistanceKm(origin.latitude, origin.longitude, row.latitude!, row.longitude!);
          return { ...row, distance_km: d, bucket: bucket(d) } as NearbyCity;
        })
        .sort((a, b) => a.distance_km - b.distance_km);

      // Take up to (limit/3) per bucket so the triptych has at least some
      // variety even if Europe (short bucket) dominates the pool.
      const perBucket = Math.ceil(limit / 3);
      const out: NearbyCity[] = [];
      for (const b of ['short', 'medium', 'long'] as const) {
        out.push(...scored.filter((c) => c.bucket === b).slice(0, perBucket));
      }
      return out.slice(0, limit);
    },
  });
}
