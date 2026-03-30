import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';

interface VisitorOrigin {
  originIata: string | null;
  originCity: string | null;
  originCountry: string | null;
  loading: boolean;
}

const SESSION_KEY = 'visitor_origin_airport';

/**
 * Resolves the visitor's nearest commercial airport.
 * Uses useVisitorLocation (CF geo headers via /api/geo) as the coordinate
 * source, then calls resolve-origin-airport to find the nearest IATA code.
 * Result is cached in sessionStorage for the session.
 */
export function useVisitorOrigin(): VisitorOrigin {
  const { location, loading: geoLoading } = useVisitorLocation();
  const [origin, setOrigin] = useState<VisitorOrigin>({
    originIata: null,
    originCity: null,
    originCountry: null,
    loading: true,
  });

  useEffect(() => {
    // 1. Check sessionStorage cache
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.originIata) {
          setOrigin({ ...parsed, loading: false });
          return;
        }
      } catch {
        /* ignore */
      }
    }

    // 2. Wait for geo location to resolve
    if (geoLoading) return;
    if (!location) {
      setOrigin((prev) => ({ ...prev, loading: false }));
      return;
    }

    // 3. Resolve nearest airport from coordinates
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('resolve-origin-airport', {
          body: { latitude: location.latitude, longitude: location.longitude },
        });

        if (error || !data?.iata) {
          setOrigin((prev) => ({ ...prev, loading: false }));
          return;
        }

        const result = {
          originIata: data.iata,
          originCity: data.city,
          originCountry: data.country,
        };

        sessionStorage.setItem(SESSION_KEY, JSON.stringify(result));
        setOrigin({ ...result, loading: false });
      } catch {
        setOrigin((prev) => ({ ...prev, loading: false }));
      }
    })();
  }, [location, geoLoading]);

  return origin;
}
