import { useEffect, useRef } from 'react';
import type { MapViewport } from '@/hooks/useExploreMapData';
import type { useVisitorLocation } from '@/hooks/useVisitorLocation';

type VisitorGeo = ReturnType<typeof useVisitorLocation>['location'];

interface UseMapAutoFlyParams {
  skipAutoFly: boolean;
  initialCenter?: [number, number];
  visitorGeo: VisitorGeo;
  /** The region the visitor picked on the homepage (or their profile home
   *  city). Outranks IP geo. `regionPending` holds IP geo back until it has
   *  resolved, so the map does not fly to the IP city and then away again. */
  region?: { latitude: number; longitude: number; name: string | null } | null;
  regionPending?: boolean;
  flyToLocation: (lng: number, lat: number, zoom?: number) => void;
  setViewport: (v: MapViewport) => void;
  showLocationHint: (label: string) => void;
}

// Neutral world view when neither URL state, an explicit prop, nor IP
// geolocation provides a center within ~2.5 s. It used to be Berlin with a
// "Showing Berlin" toast, which told a visitor anywhere else that we thought
// they were in Berlin. Centred off the Sahara (DEFAULT_CENTER = [0, 20] reads
// as "broken"); no toast, because there is no city to name.
// A fly still happens: the initial world fetch is deferred until it does.
export const WORLD_CENTER: [number, number] = [15, 30];
export const WORLD_ZOOM = 1.8;

/**
 * Auto-fly to the visitor's IP geolocation on load, falling back to a neutral
 * world view if geolocation hasn't resolved within 2.5s.
 */
export function useMapAutoFly({
  skipAutoFly,
  initialCenter,
  visitorGeo,
  region = null,
  regionPending = false,
  flyToLocation,
  setViewport,
  showLocationHint,
}: UseMapAutoFlyParams) {
  // World fallback fired.
  const fallbackFiredRef = useRef(false);
  // True only when we flew to the *user's* real location. The world fallback
  // does NOT set this, so a late-arriving visitorGeo still overrides it.
  const userGeoFiredRef = useRef(false);

  useEffect(() => {
    if (skipAutoFly || initialCenter || userGeoFiredRef.current) return;
    const target = region
      ? { lng: region.longitude, lat: region.latitude, city: region.name }
      : !regionPending && visitorGeo
        ? { lng: visitorGeo.longitude, lat: visitorGeo.latitude, city: visitorGeo.city ?? null }
        : null;
    if (!target) return;
    userGeoFiredRef.current = true;
    setViewport({ center: [target.lng, target.lat], zoom: 10 });
    flyToLocation(target.lng, target.lat, 10);
    showLocationHint(target.city ? `Showing ${target.city}` : 'Showing your area');
  }, [
    region,
    regionPending,
    visitorGeo,
    flyToLocation,
    skipAutoFly,
    initialCenter,
    showLocationHint,
    setViewport,
  ]);

  useEffect(() => {
    if (skipAutoFly || initialCenter || fallbackFiredRef.current) return;
    const timer = setTimeout(() => {
      if (visitorGeo || fallbackFiredRef.current || userGeoFiredRef.current) return;
      fallbackFiredRef.current = true;
      setViewport({ center: WORLD_CENTER, zoom: WORLD_ZOOM });
      flyToLocation(WORLD_CENTER[0], WORLD_CENTER[1], WORLD_ZOOM);
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipAutoFly, initialCenter]);
}
