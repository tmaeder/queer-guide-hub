import { useEffect, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource } from 'maplibre-gl';
import { ink } from '@/lib/mapTokens';
import {
  ROUTE_LINE_LAYER,
  ROUTE_SOURCE,
  ROUTE_STOP_LABEL_LAYER,
  ROUTE_STOP_LAYER,
} from '@/config/mapLayers';
import type { MapRoute } from '@/components/map/mapDomain';

interface UseRouteLinesParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  /** Draw the route at all — `viewRenderPlan(...).routes`. */
  enabled: boolean;
  route?: MapRoute;
  /** Emphasise one leg (the trip day filter). All legs when null. */
  activeGroup?: string | null;
}

/**
 * The route's GeoJSON, as a pure function so the geometry invariants are
 * testable without a MapLibre instance: every stop coordinate must BE a
 * LineString vertex (set membership, not a distance tolerance), the vertex
 * order must EQUAL the `position` order, and `coordinates.length` must equal
 * the stop count — a silently dropped stop fails there and nowhere else.
 */
export function routeFeatures(route: MapRoute): GeoJSON.FeatureCollection {
  // `position` ordering, never array arrival order. An itinerary sorted
  // featured-then-nearest is wrong by construction.
  const stops = [...route.stops].sort((a, b) => a.position - b.position);
  const features: GeoJSON.Feature[] = [];

  if (stops.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'leg', group: route.id },
      geometry: {
        type: 'LineString',
        coordinates: stops.map((s) => [s.station.lng, s.station.lat]),
      },
    });
  }

  for (const s of stops) {
    features.push({
      type: 'Feature',
      properties: {
        kind: 'stop',
        group: route.id,
        // The reader-facing number. Taken from `position`, so a gap SHOWS.
        label: String(s.position),
      },
      geometry: { type: 'Point', coordinates: [s.station.lng, s.station.lat] },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * The route line and its numbered stops.
 *
 * This is what makes the `routes` view draw something rather than nothing. The
 * geometry is lifted from `TripMap`, which has drawn working route lines all
 * along — it was never reachable from `MapShell`, because `lensToRenderMode`
 * had no `routes` branch.
 *
 * **Days are NOT coloured, and `dayColor()` is deliberately not carried over.**
 * `TripMap`'s `hsl((330 + i*47) % 360, 70%, 52%)` was the only raw-HSL palette
 * on any map here; it drifts from the design system by construction, and it
 * encodes day identity by HUE ALONE, which fails WCAG 1.4.1 as written. The
 * four tracks cannot replace it either: tracks are IDENTITY and are already on
 * this canvas colouring the pins, so day 2's line would be the same hue as
 * every event pin.
 *
 * So emphasis replaces enumeration — every leg draws `ink(0.55)`, and when a
 * group is selected the others drop to `ink(0.15)` while it goes full `ink()`.
 * The day filter already exists, so nothing is lost. **The stop NUMBER is
 * non-negotiable**: it is the only cue that survives any colour decision, and
 * `MapRouteStop.position` is authoritative — survivors keep their original
 * numbers, so a route missing stop 3 renders 1, 2, 4, 5 and the gap is
 * VISIBLE. Silently closing it presents a wrong route as a right one.
 */
export function useRouteLines({
  mapRef,
  mapReady,
  enabled,
  route,
  activeGroup,
}: UseRouteLinesParams) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const teardown = () => {
      for (const id of [ROUTE_STOP_LABEL_LAYER, ROUTE_STOP_LAYER, ROUTE_LINE_LAYER]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
    };

    // Two stops is the minimum for a LINE. One stop still draws its numbered
    // marker — a one-stop route is a real thing, and refusing to draw it would
    // be the silent fall-through this view exists to avoid.
    if (!enabled || !route || route.stops.length === 0) {
      teardown();
      return;
    }

    const data = routeFeatures(route);

    const existing = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
    } else {
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data });
    }

    // Emphasis, not enumeration. `activeGroup` dims the rest rather than
    // recolouring them, so no hue carries meaning.
    const dim = activeGroup != null && activeGroup !== route.id;
    const lineOpacity = dim ? 0.15 : 0.55;

    if (!map.getLayer(ROUTE_LINE_LAYER)) {
      map.addLayer({
        id: ROUTE_LINE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'kind'], 'leg'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ink(),
          'line-width': 2,
          'line-opacity': lineOpacity,
          'line-dasharray': [2, 4],
        },
      });
    } else {
      map.setPaintProperty(ROUTE_LINE_LAYER, 'line-opacity', lineOpacity);
    }

    if (!map.getLayer(ROUTE_STOP_LAYER)) {
      map.addLayer({
        id: ROUTE_STOP_LAYER,
        type: 'circle',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'kind'], 'stop'],
        paint: {
          // Paper disc with an ink ring — the station treatment, so a route
          // stop reads as the same vocabulary as everything else on the map.
          'circle-radius': 9,
          'circle-color': ink(0.04),
          'circle-stroke-width': 2,
          'circle-stroke-color': ink(),
          'circle-opacity': 1,
        },
      });
    }

    if (!map.getLayer(ROUTE_STOP_LABEL_LAYER)) {
      map.addLayer({
        id: ROUTE_STOP_LABEL_LAYER,
        type: 'symbol',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'kind'], 'stop'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': ink() },
      });
    }

    return () => {
      // Only on unmount / disable — a data change takes the setData path above.
    };
  }, [mapRef, mapReady, enabled, route, activeGroup]);
}
