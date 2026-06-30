import { useEffect, useRef } from 'react';
import type { MapViewport } from '@/hooks/useExploreMapData';
import type { useVisitorLocation } from '@/hooks/useVisitorLocation';

type VisitorGeo = ReturnType<typeof useVisitorLocation>['location'];

interface UseMapAutoFlyParams {
  skipAutoFly: boolean;
  initialCenter?: [number, number];
  visitorGeo: VisitorGeo;
  flyToLocation: (lng: number, lat: number, zoom?: number) => void;
  setViewport: (v: MapViewport) => void;
  showLocationHint: (label: string) => void;
}

// Berlin — used as a curated fallback when neither URL state, an explicit prop,
// nor IP geolocation provides a center within ~2.5 s. Avoids the cold-load
// Sahara view (DEFAULT_CENTER = [0, 20] is empty desert → reads as "broken").
const FALLBACK_CENTER: [number, number] = [13.405, 52.52];
const FALLBACK_ZOOM = 10;

/**
 * Auto-fly to the visitor's IP geolocation on load, with a Berlin fallback if
 * geolocation hasn't resolved within 2.5s. Extracted verbatim from ExploreMap —
 * behavior-preserving.
 */
export function useMapAutoFly({
  skipAutoFly,
  initialCenter,
  visitorGeo,
  flyToLocation,
  setViewport,
  showLocationHint,
}: UseMapAutoFlyParams) {
  // Berlin fallback fired (cosmetic, prevents repeat toast).
  const fallbackFiredRef = useRef(false);
  // True only when we flew to the *user's* real location. Berlin fallback
  // does NOT set this, so a late-arriving visitorGeo still overrides Berlin.
  const userGeoFiredRef = useRef(false);

  useEffect(() => {
    if (skipAutoFly || initialCenter || !visitorGeo) return;
    if (userGeoFiredRef.current) return;
    userGeoFiredRef.current = true;
    setViewport({ center: [visitorGeo.longitude, visitorGeo.latitude], zoom: 10 });
    flyToLocation(visitorGeo.longitude, visitorGeo.latitude, 10);
    showLocationHint(visitorGeo.city ? `Showing ${visitorGeo.city}` : 'Showing your area');
  }, [visitorGeo, flyToLocation, skipAutoFly, initialCenter, showLocationHint, setViewport]);

  useEffect(() => {
    if (skipAutoFly || initialCenter || fallbackFiredRef.current) return;
    const timer = setTimeout(() => {
      if (visitorGeo || fallbackFiredRef.current || userGeoFiredRef.current) return;
      fallbackFiredRef.current = true;
      setViewport({ center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM });
      flyToLocation(FALLBACK_CENTER[0], FALLBACK_CENTER[1], FALLBACK_ZOOM);
      showLocationHint('Showing Berlin');
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipAutoFly, initialCenter]);
}
