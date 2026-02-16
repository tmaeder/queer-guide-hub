import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VisitorOrigin {
  originIata: string | null;
  originCity: string | null;
  originCountry: string | null;
  loading: boolean;
}

const SESSION_KEY = 'visitor_origin_airport';

/**
 * Resolves the visitor's nearest commercial airport using:
 * 1. sessionStorage cache (fastest)
 * 2. Cloudflare geo headers via window.CF (if available on CF Workers/Pages)
 * 3. Browser Geolocation API (prompt-based fallback)
 *
 * The resolved IATA code is cached per session.
 */
export function useVisitorOrigin(): VisitorOrigin {
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
        setOrigin({ ...parsed, loading: false });
        return;
      } catch { /* ignore parse errors */ }
    }

    const resolveFromCoords = async (lat: number, lng: number) => {
      try {
        const { data, error } = await supabase.functions.invoke('resolve-origin-airport', {
          body: { latitude: lat, longitude: lng },
        });

        if (error || !data?.iata) {
          setOrigin(prev => ({ ...prev, loading: false }));
          return;
        }

        const result = {
          originIata: data.iata,
          originCity: data.city,
          originCountry: data.country,
        };

        sessionStorage.setItem(SESSION_KEY, JSON.stringify(result));
        setOrigin({ ...result, loading: false });
      } catch (err) {
        console.error('Failed to resolve visitor origin:', err);
        setOrigin(prev => ({ ...prev, loading: false }));
      }
    };

    // 2. Try Cloudflare geo headers (available when served via CF Workers)
    const cfData = (window as any).CF;
    if (cfData?.latitude && cfData?.longitude) {
      const lat = parseFloat(cfData.latitude);
      const lng = parseFloat(cfData.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        resolveFromCoords(lat, lng);
        return;
      }
    }

    // 3. Fallback to browser Geolocation API
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolveFromCoords(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
          console.warn('Geolocation denied or unavailable:', err.message);
          setOrigin(prev => ({ ...prev, loading: false }));
        },
        { timeout: 10000, maximumAge: 300000 } // 5min cache, 10s timeout
      );
    } else {
      // No geolocation available
      setOrigin(prev => ({ ...prev, loading: false }));
    }
  }, []);

  return origin;
}
