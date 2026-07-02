/* eslint-disable react-hooks/refs -- receives the component-owned map + latest-value refs read inside the debounced recompute; documented MapLibre integration pattern. */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { summaryFromFeature, type MapPointSummary } from '@/components/map/mapPoint';
import type { PointFeature } from '@/hooks/useViewportPoints';
import type { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { calculateDistanceKm } from '@/utils/calculateDistance';

type VisitorGeo = ReturnType<typeof useVisitorLocation>['location'];

// Stable empty favorites set so effects don't churn when none are passed.
const EMPTY_FAV: ReadonlySet<string> = new Set<string>();

interface UseInBoundsCountParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  pointsGeoJSON: GeoJSON.FeatureCollection;
  visitorGeo: VisitorGeo;
  favoriteIds?: Set<string>;
  savedOnly: boolean;
  onPointsInViewRef: MutableRefObject<((points: MapPointSummary[]) => void) | undefined>;
}

/**
 * Debounced "N results in view" counter + the in-view point set lifted to the
 * parent (spotlight rail). The padded fetch returns 15% more features than the
 * visible viewport; this counts what the user actually sees. Extracted verbatim
 * from ExploreMap — behavior-preserving.
 *
 * Returns `recomputeRef` because the init-effect's `moveend` handler (which
 * stays in the component) calls it for pans/flyTo that don't trigger a refetch.
 */
export function useInBoundsCount({
  mapRef,
  pointsGeoJSON,
  visitorGeo,
  favoriteIds,
  savedOnly,
  onPointsInViewRef,
}: UseInBoundsCountParams) {
  // Count of currently-rendered point features inside the visible map
  // bounds. Recomputed on moveend (debounced) so the "X results in view"
  // counter matches what the user actually sees, not the padded fetch bbox.
  const [inBoundsCount, setInBoundsCount] = useState(0);
  // True from the instant the user starts panning/zooming until the next
  // count recomputes. Without this the pill shows the OLD count for the
  // 100-200ms debounce window, which reads as "the map is lying."
  const [isCounterStale, setIsCounterStale] = useState(false);

  const inBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recomputeInBoundsCount = useCallback(() => {
    if (inBoundsTimerRef.current) clearTimeout(inBoundsTimerRef.current);
    inBoundsTimerRef.current = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      const b = map.getBounds();
      const w = b.getWest();
      const e = b.getEast();
      const s = b.getSouth();
      const n = b.getNorth();
      let count = 0;
      const inBounds: PointFeature[] = [];
      for (const f of pointsGeoJSON.features) {
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        if (lng >= w && lng <= e && lat >= s && lat <= n) {
          count++;
          inBounds.push(f as unknown as PointFeature);
        }
      }
      setInBoundsCount(count);
      setIsCounterStale(false);

      // Lift the in-view set up to the parent (spotlight rail), enriched with
      // favorite tagging + distance from the viewer when we know their location.
      const cb = onPointsInViewRef.current;
      if (cb) {
        const favSet = favoriteIds ?? EMPTY_FAV;
        const geo = visitorGeo;
        const feats = savedOnly
          ? inBounds.filter((f) => favSet.has(String(f.properties.id)))
          : inBounds;
        const summaries = feats.slice(0, 80).map((f) => {
          const sum = summaryFromFeature(f);
          sum.favorited = favSet.has(sum.id);
          if (geo) sum.distanceKm = calculateDistanceKm(geo.latitude, geo.longitude, sum.lat, sum.lng);
          return sum;
        });
        cb(summaries);
      }
    }, 100);
  }, [pointsGeoJSON, visitorGeo, favoriteIds, savedOnly, mapRef, onPointsInViewRef]);

  // The `moveend` listener is registered once (init effect) and would otherwise
  // capture the first-render recompute (empty data). Route it through a ref so
  // pans/flyTo that don't trigger a refetch still count the latest features.
  const recomputeRef = useRef(recomputeInBoundsCount);
  recomputeRef.current = recomputeInBoundsCount;

  // Recompute whenever the fetched data changes (not just on pan).
  useEffect(() => {
    recomputeInBoundsCount();
  }, [pointsGeoJSON, recomputeInBoundsCount]);

  useEffect(() => {
    return () => {
      if (inBoundsTimerRef.current) clearTimeout(inBoundsTimerRef.current);
    };
  }, []);

  return { inBoundsCount, isCounterStale, setIsCounterStale, recomputeInBoundsCount, recomputeRef };
}
