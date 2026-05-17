import { useCallback, useState } from 'react';

interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * Web Geolocation wrapper for the "Near me" affordance. Returns the captured
 * coords once and lets the caller decide whether to navigate / set a filter.
 */
export function useNearMe() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const request = useCallback(() => {
    if (!supported) {
      setError('unsupported');
      return Promise.resolve<Coords | null>(null);
    }
    setLoading(true);
    setError(null);
    return new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: Coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setCoords(c);
          setLoading(false);
          resolve(c);
        },
        (err) => {
          setError(err.code === 1 ? 'denied' : 'unavailable');
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }, [supported]);

  const clear = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  return { supported, coords, loading, error, request, clear };
}
