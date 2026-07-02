import { useEffect, type MutableRefObject } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import type { LayerType } from '@/hooks/useExploreMapData';
import {
  CLUSTERS_LAYER,
  HEATMAP_LAYER,
  HEATMAP_SOURCE,
  PIN_LAYER_IDS,
} from '@/config/mapLayers';
import { heatmapRenderPlan, type RenderMode } from '@/components/map/mapShellAdapters';

interface UseHeatmapLayerParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  renderMode: RenderMode;
  pointsGeoJSON: GeoJSON.FeatureCollection;
  pointEnabledLayers: LayerType[];
  prefersReducedMotion: boolean;
}

/**
 * Heatmap (Density lens) layer with monochrome black-alpha ramp + render-mode
 * pin visibility. Extracted verbatim from ExploreMap — behavior-preserving.
 * MUST stay declared after the pins effect (load-bearing `beforeId` z-order).
 */
export function useHeatmapLayer({
  mapRef,
  mapReady,
  renderMode,
  pointsGeoJSON,
  pointEnabledLayers,
  prefersReducedMotion,
}: UseHeatmapLayerParams) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const { wantHeatmap, hidePins } = heatmapRenderPlan(
      renderMode,
      pointEnabledLayers.length > 0,
    );

    if (!wantHeatmap) {
      if (map.getLayer(HEATMAP_LAYER)) map.removeLayer(HEATMAP_LAYER);
      if (map.getSource(HEATMAP_SOURCE)) map.removeSource(HEATMAP_SOURCE);
      // Restore cluster/pin layer visibility
      for (const id of PIN_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      }
      return;
    }

    // Pure density (`heatmap`) hides the pins; `combined` keeps them on top.
    const pinVisibility = hidePins ? 'none' : 'visible';
    for (const id of PIN_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', pinVisibility);
    }

    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pointsGeoJSON.features.filter((f) =>
        pointEnabledLayers.includes(f.properties.pointType),
      ),
    };

    const existing = map.getSource(HEATMAP_SOURCE) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(filteredGeoJSON);
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
    // Softened peak (was 0.85→0.65): the heat is an accent, not a blanket.
    const heatOpacityExpr: maplibregl.ExpressionSpecification = [
      'interpolate',
      ['linear'],
      ['zoom'],
      0,
      0.5,
      9,
      0.4,
      14,
      0.32,
      16,
      0,
    ];
    map.addLayer({
      id: HEATMAP_LAYER,
      type: 'heatmap',
      source: HEATMAP_SOURCE,
      maxzoom: 16,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 9, 1.4],
        // Monochrome black-alpha density ramp (design system: no hue, no
        // shadow). Kept low-alpha so the field reads as a soft underglow
        // beneath the pins — never an opaque blanket that buries them. The
        // former pride-spectrum ramp was removed in the monochrome strip.
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.2,
          'rgba(0,0,0,0.10)',
          0.4,
          'rgba(0,0,0,0.20)',
          0.6,
          'rgba(0,0,0,0.32)',
          0.8,
          'rgba(0,0,0,0.44)',
          1,
          'rgba(0,0,0,0.55)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 9, 26, 14, 52],
        // Start transparent and cross-fade in when switching into a heat lens.
        'heatmap-opacity': prefersReducedMotion ? heatOpacityExpr : 0,
        'heatmap-opacity-transition': { duration: 350, delay: 0 },
      },
    }, beforeId);

    if (!prefersReducedMotion) {
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (m?.getLayer(HEATMAP_LAYER)) m.setPaintProperty(HEATMAP_LAYER, 'heatmap-opacity', heatOpacityExpr);
      });
    }
  }, [renderMode, pointsGeoJSON, pointEnabledLayers, mapReady, prefersReducedMotion, mapRef]);
}
