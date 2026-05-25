import { useState, useEffect } from 'react';

export interface VisitorLocation {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  region?: string;
}

/**
 * Returns the visitor's approximate location from Cloudflare geo headers
 * via our own /api/geo CF Pages Function. Data never leaves the trust boundary.
 *
 * Falls back gracefully — returns null if geo data is unavailable.
 * Sensitive geo coordinates are kept in memory only (not persisted in web storage).
 */
export function useVisitorLocation() {
  const [location, setLocation] = useState<VisitorLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Fetch from our CF Pages Function (same-origin, no external vendor)
        const res = await fetch('/api/geo');
        if (!res.ok) throw new Error(`geo ${res.status}`);
        const data = await res.json();

        if (cancelled) return;

        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          const loc: VisitorLocation = {
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city ?? undefined,
            country: data.country ?? undefined,
            region: data.region ?? undefined,
          };
          setLocation(loc);
        }
      } catch {
        // Geo unavailable — silent fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { location, loading };
}
