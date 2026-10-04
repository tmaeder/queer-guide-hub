import { useEffect, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource } from 'maplibre-gl';
import { monoHeatStops } from '@/hooks/useExploreMapData';
import type { MapLine } from '@/components/map/mapDomain';
import {
  CLUSTERS_LAYER,
  HEATMAP_LAYER,
  HEATMAP_SOURCE,
  HEAT_OPACITY_FULL,
  HEAT_OPACITY_WASH,
  PIN_LAYER_IDS,
} from '@/config/mapLayers';
import type { HeatMode } from '@/components/map/mapShellAdapters';
import { durationMs, imperativeDurationMs } from '@/lib/animation';

interface UseHeatmapLayerParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  /** `off` | `full` (the heat view) | `wash` (the stations view's underglow). */
  heat: HeatMode;
  /** Whether station pins are part of this view at all. */
  stations: boolean;
  pointsGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Point, { line: MapLine | null }>;
  /** Lines currently drawn — the heat surface reflects the same set the pins do. */
  activeLines: MapLine[];
  prefersReducedMotion: boolean;
}

/**
 * Heatmap layer with the monochrome black-alpha ramp, plus pin visibility for
 * the view. MUST stay declared AFTER the pins effect — the `beforeId` z-order
 * below depends on it, and the comments explaining why are load-bearing.
 *
 * Since `stations` mounts the heat source at WASH opacity, this effect now
 * runs on essentially every load rather than only when someone picks Heat, so
 * the cold-start window those comments describe is the normal path. Do not
 * reorder the two effects.
 */
export function useHeatmapLayer({
  mapRef,
  mapReady,
  heat,
  stations,
  pointsGeoJSON,
  activeLines,
  prefersReducedMotion,
}: UseHeatmapLayerParams) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const wantHeatmap = heat !== 'off' && activeLines.length > 0;

    if (!wantHeatmap) {
      if (map.getLayer(HEATMAP_LAYER)) map.removeLayer(HEATMAP_LAYER);
      if (map.getSource(HEATMAP_SOURCE)) map.removeSource(HEATMAP_SOURCE);
      // Pin visibility still follows the PLAN, not the heat. A bare
      // `visibility: 'visible'` here would un-hide every pin under `areas`
      // and under an empty `routes` view — both are heat-off AND station-less,
      // a combination that did not exist while this was a lens.
      const vis = stations ? 'visible' : 'none';
      for (const id of PIN_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
      }
      return;
    }

    // The heat view hides every pin; the stations view keeps them above the
    // wash. `stations` comes from the plan, so a view that draws no pins at
    // all (areas, an empty routes view) cannot leave one painted.
    const pinVisibility = stations ? 'visible' : 'none';
    for (const id of PIN_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', pinVisibility);
    }

    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pointsGeoJSON.features.filter((f) =>
        activeLines.includes(f.properties.line as MapLine),
      ),
    };

    // Paint DATA, not React state: a zoom branch in a prop would re-render the
    // whole shell on every wheel tick. Both ramps live in config/mapLayers so
    // they stay unit-testable (monotone, WASH <= FULL at every shared stop,
    // WASH at 0 by z10).
    const stops = heat === 'wash' ? HEAT_OPACITY_WASH : HEAT_OPACITY_FULL;
    const heatOpacityExpr: maplibregl.ExpressionSpecification = [
      'interpolate',
      ['linear'],
      ['zoom'],
      ...stops.flat(),
    ] as maplibregl.ExpressionSpecification;

    const existing = map.getSource(HEATMAP_SOURCE) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(filteredGeoJSON);
      // The ramp must be re-applied on this path. `stations` mounts the source
      // at WASH, so switching to the heat view reaches here with the layer
      // already present — before the two ramps coexisted, the only transition
      // was off -> on, which always took the addLayer branch below.
      if (map.getLayer(HEATMAP_LAYER)) {
        map.setPaintProperty(HEATMAP_LAYER, 'heatmap-opacity', heatOpacityExpr);
      }
      return;
    }

    map.addSource(HEATMAP_SOURCE, { type: 'geojson', data: filteredGeoJSON });
    // Insert beneath the pin/cluster layers so markers stay on top in the
    // combined lens. `beforeId` is undefined when pins aren't mounted yet
    // (pure-density), which appends on top exactly as before.
    // Z-order: the pins effect is declared *before* this heatmap effect, so it
    // runs first within a commit — CLUSTERS_LAYER usually exists by now and
    // beforeId slots the heatmap below the pins. Cold-start window (layers
    // enabled but zero features → pins effect skips layer creation): beforeId
    // is undefined and the heatmap appends on top, but once data arrives the
    // pins effect adds the cluster layers ABOVE this heatmap (and this effect
    // early-returns via setData without re-inserting). Pins end up on top in
    // every path. Don't reorder the two effects.
    const beforeId = map.getLayer(CLUSTERS_LAYER) ? CLUSTERS_LAYER : undefined;
    map.addLayer(
      {
        id: HEATMAP_LAYER,
        type: 'heatmap',
        source: HEATMAP_SOURCE,
        maxzoom: 16,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 9, 1.4],
          // Monochrome black-alpha density ramp (design system: no hue, no
          // shadow). Kept low-alpha so the field reads as a soft underglow
          // beneath the pins — never an opaque blanket that buries them.
          // Stops shared with the legend via monoHeatStops().
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            ...monoHeatStops().flat(),
          ] as maplibregl.ExpressionSpecification,
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 9, 26, 14, 52],
          // Start transparent and cross-fade in when switching into a heat lens.
          'heatmap-opacity': prefersReducedMotion ? heatOpacityExpr : 0,
          'heatmap-opacity-transition': {
            duration: imperativeDurationMs(durationMs.normal),
            delay: 0,
          },
        },
      },
      beforeId,
    );

    if (!prefersReducedMotion) {
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (m?.getLayer(HEATMAP_LAYER))
          m.setPaintProperty(HEATMAP_LAYER, 'heatmap-opacity', heatOpacityExpr);
      });
    }
  }, [heat, stations, pointsGeoJSON, activeLines, mapReady, prefersReducedMotion, mapRef]);
}
