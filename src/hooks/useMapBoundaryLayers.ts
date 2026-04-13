/**
 * Manages MapLibre boundary polygon layers (fill + stroke + label) with
 * hover feature-state and click popups. Handles add/update/remove lifecycle
 * for a single boundary type (countries, cities, or neighbourhoods).
 *
 * Extracted from ExploreMap.tsx to DRY up ~300 lines of triplicated code.
 */

import { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { LayerType, MapMarker } from '@/hooks/useExploreMapData';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import { enrichBoundaryFeatures } from '@/utils/boundaryUtils';
import type { MatchMode } from '@/utils/boundaryUtils';

export interface BoundaryLayerConfig {
  /** Unique prefix for source/layer IDs, e.g. 'countries' */
  key: string;
  /** Layer type for popup rendering */
  entityType: LayerType;
  /** GeoJSON property to match against markers */
  matchKey: string;
  /** Match mode: 'code' for countries (ISO_A2→meta.code), 'entityId' for cities/villages */
  matchMode: MatchMode;
  /** Minimum zoom for label display */
  minLabelZoom?: number;
  /** Minimum zoom for all layers */
  minLayerZoom?: number;
}

interface UseMapBoundaryLayersOptions {
  map: maplibregl.Map | null;
  mapReady: boolean;
  config: BoundaryLayerConfig;
  boundaries: GeoJSON.FeatureCollection | undefined;
  markers: MapMarker[];
  enabled: boolean;
  tooltipEl: HTMLDivElement | null;
  onPopup: (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => void;
}

function sourceId(key: string) { return `boundary-${key}`; }
function fillId(key: string) { return `boundary-${key}-fill`; }
function strokeId(key: string) { return `boundary-${key}-stroke`; }
function labelId(key: string) { return `boundary-${key}-label`; }

export function useMapBoundaryLayers({
  map,
  mapReady,
  config,
  boundaries,
  markers,
  enabled,
  tooltipEl,
  onPopup,
}: UseMapBoundaryLayersOptions) {
  const hoveredIdRef = useRef<number | null>(null);
  const addedRef = useRef(false);

  const { key, entityType, matchKey, matchMode, minLabelZoom = 3, minLayerZoom } = config;
  const src = sourceId(key);
  const fill = fillId(key);
  const stroke = strokeId(key);
  const label = labelId(key);

  const removeLayers = useCallback((m: maplibregl.Map) => {
    try {
      if (m.getLayer(label)) m.removeLayer(label);
      if (m.getLayer(stroke)) m.removeLayer(stroke);
      if (m.getLayer(fill)) m.removeLayer(fill);
      if (m.getSource(src)) m.removeSource(src);
    } catch { /* map may be destroyed */ }
    addedRef.current = false;
  }, [src, fill, stroke, label]);

  useEffect(() => {
    if (!map || !mapReady) return;
    // Guard against destroyed map (e.g. ErrorBoundary remount)
    try { map.getContainer(); } catch { return; }

    // Remove if disabled or no data
    if (!boundaries || !enabled) {
      removeLayers(map);
      return;
    }

    const enriched = enrichBoundaryFeatures(boundaries, markers, matchKey, matchMode);
    if (enriched.features.length === 0) return;

    const color = LAYER_COLORS[entityType] ?? '#888';

    // Update existing source
    const existingSource = map.getSource(src) as GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(enriched);
      return;
    }

    // Create source + layers
    map.addSource(src, {
      type: 'geojson',
      data: enriched,
      promoteId: 'entityId',
    });

    map.addLayer({
      id: fill,
      type: 'fill',
      source: src,
      ...(minLayerZoom != null && { minzoom: minLayerZoom }),
      paint: {
        'fill-color': color,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.35,
          ['boolean', ['feature-state', 'hovered'], false], 0.22,
          0.1,
        ],
        'fill-opacity-transition': { duration: 250 },
      },
    });

    map.addLayer({
      id: stroke,
      type: 'line',
      source: src,
      ...(minLayerZoom != null && { minzoom: minLayerZoom }),
      paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#1e293b', color],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2.5,
          ['boolean', ['feature-state', 'hovered'], false], 1.8,
          0.8,
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.8,
          ['boolean', ['feature-state', 'hovered'], false], 0.7,
          0.5,
        ],
        'line-width-transition': { duration: 200 },
      },
    });

    map.addLayer({
      id: label,
      type: 'symbol',
      source: src,
      minzoom: minLabelZoom,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 12, 8, 14],
        'text-font': ['Noto Sans Medium'],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#1e293b',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });

    // Hover via feature-state
    map.on('mousemove', fill, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      map.getCanvas().style.cursor = 'pointer';
      const numId = feat.id as number | undefined;

      if (hoveredIdRef.current !== null && hoveredIdRef.current !== numId) {
        map.setFeatureState({ source: src, id: hoveredIdRef.current }, { hovered: false });
      }
      if (numId != null) {
        map.setFeatureState({ source: src, id: numId }, { hovered: true });
        hoveredIdRef.current = numId;
      }

      // Tooltip
      if (tooltipEl && feat.properties) {
        const props = feat.properties as Record<string, string>;
        while (tooltipEl.firstChild) tooltipEl.removeChild(tooltipEl.firstChild);
        const nameEl = document.createElement('strong');
        nameEl.textContent = props.name ?? '';
        tooltipEl.appendChild(nameEl);
        tooltipEl.style.left = `${e.point.x + 12}px`;
        tooltipEl.style.top = `${e.point.y - 12}px`;
        tooltipEl.style.display = 'block';
      }
    });

    map.on('mouseleave', fill, () => {
      map.getCanvas().style.cursor = '';
      if (hoveredIdRef.current !== null) {
        map.setFeatureState({ source: src, id: hoveredIdRef.current }, { hovered: false });
        hoveredIdRef.current = null;
      }
      if (tooltipEl) tooltipEl.style.display = 'none';
    });

    // Click → popup
    map.on('click', fill, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties as Record<string, string>;
      const meta: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k.startsWith('meta_')) {
          try { meta[k.slice(5)] = JSON.parse(v); } catch { meta[k.slice(5)] = v; }
        }
      }
      const marker = markers.find((m) => m.id === props.entityId);
      const lngLat = marker ? new maplibregl.LngLat(marker.lng, marker.lat) : e.lngLat;

      onPopup(map, lngLat, {
        id: props.entityId,
        type: entityType,
        lat: lngLat.lat,
        lng: lngLat.lng,
        name: props.name,
        subtitle: props.subtitle || undefined,
        color: props.color,
        linkTo: props.linkTo || undefined,
        meta,
      });
    });

    addedRef.current = true;
  }, [map, mapReady, boundaries, markers, enabled, config, tooltipEl, onPopup, removeLayers,
      src, fill, stroke, label, key, entityType, matchKey, matchMode, minLabelZoom, minLayerZoom]);

  return { removeLayers };
}
