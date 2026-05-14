import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ExistingCity {
  image_url?: string | null;
  curated_image_url?: string | null;
  image_flagged?: boolean | null;
}

/**
 * Fetches/refreshes a city's hero image.
 * - Short-circuits on `curated_image_url` and on existing `image_url` when not flagged.
 * - Only calls the edge function on real misses or when `refresh: true`.
 */
export const useCityImages = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCityImage = useCallback(
    async (
      cityId: string,
      cityName: string,
      countryName?: string,
      opts: { refresh?: boolean; existing?: ExistingCity } = {},
    ) => {
      setError(null);

      const existing = opts.existing;
      if (!opts.refresh) {
        if (existing?.curated_image_url) {
          return { image_url: existing.curated_image_url, image_metadata: null, cached: true };
        }
        if (existing?.image_url && !existing.image_flagged) {
          return { image_url: existing.image_url, image_metadata: null, cached: true };
        }
      }

      setLoading(true);
      try {
        const { data, error: functionError } = await supabase.functions.invoke(
          'fetch-images',
          {
            body: {
              entity_type: 'city',
              id: cityId,
              name: cityName,
              country: countryName,
              forceUpdate: !!opts.refresh,
            },
          },
        );

        if (functionError) {
          throw new Error(functionError.message || 'Failed to fetch city image');
        }
        if (!data?.success) {
          // Rejected / no acceptable candidate — treat as non-fatal miss.
          if (data?.rejected) return null;
          throw new Error(data?.error || 'Failed to fetch city image');
        }

        return {
          image_url: data.image_url,
          image_metadata: data.image_metadata,
          cached: data.cached,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { fetchCityImage, loading, error };
};
