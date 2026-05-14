import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CountryCentroid {
  /** Lowercased country name, for case-insensitive lookup. */
  name: string;
  latitude: number;
  longitude: number;
}

let cache: CountryCentroid[] | null = null;

/**
 * Returns lat/lng centroids for all countries with coordinates. Cached for
 * the lifetime of the JS module — countries change rarely. Used by the
 * Personalities map view to plot nationality-based markers.
 */
export function useCountryCentroids() {
  const [centroids, setCentroids] = useState<CountryCentroid[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('countries')
        .select('name,latitude,longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (cancelled) return;
      if (error || !data) {
        setLoading(false);
        return;
      }
      const rows = data
        .filter((c) => typeof c.latitude === 'number' && typeof c.longitude === 'number')
        .map((c) => ({
          name: String(c.name).toLowerCase(),
          latitude: Number(c.latitude),
          longitude: Number(c.longitude),
        }));
      cache = rows;
      setCentroids(rows);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { centroids, loading };
}
