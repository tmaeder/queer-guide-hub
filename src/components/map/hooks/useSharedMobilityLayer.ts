import { useEffect, useState, type MutableRefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { ink, paper } from '@/lib/mapTokens';
import { MAP_FONT_BOLD } from '@/config/mapStyle';
import { PIN_LAYER_IDS } from '@/config/mapLayers';
import type { MapViewport } from '@/hooks/useExploreMapData';

const SOURCE = 'shared-mobility';
const CIRCLES = 'shared-mobility-circles';
const COUNTS = 'shared-mobility-counts';
/** Below this zoom ~100 m cells are sub-pixel noise; the layer stays empty. */
export const SHARED_MOBILITY_MIN_ZOOM = 13;

interface SnapshotBbox {
  generated_at?: string;
  attribution?: string;
  cells?: [number, number, number][];
}

export interface SharedMobilityStatus {
  attribution: string | null;
  generatedAt: string | null;
  cells: number;
  /** True when zoomed out past SHARED_MOBILITY_MIN_ZOOM — tell the reader to zoom in. */
  tooFar: boolean;
}

export function cellsToGeoJSON(
  cells: [number, number, number][],
): GeoJSON.FeatureCollection<GeoJSON.Point, { count: number }> {
  return {
    type: 'FeatureCollection',
    features: cells.map(([lat, lng, count]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { count },
    })),
  };
}

/**
 * Shared bikes & e-scooters as a MONOCHROME density overlay — deliberately not a
 * fifth pin type: the four track colours are all taken by point layers and no two
 * pin types may share a hue. Cells come from our own snapshot
 * (`shared_mobility_in_bbox`); the browser never calls the upstream feed.
 * Drawn beneath the pins so venues stay on top.
 */
export function useSharedMobilityLayer({
  mapRef,
  mapReady,
  enabled,
  viewport,
}: {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  enabled: boolean;
  viewport: MapViewport;
}): SharedMobilityStatus | null {
  const [snap, setSnap] = useState<{
    attribution: string | null;
    generatedAt: string | null;
    cells: number;
  } | null>(null);
  const tooFar = viewport.zoom < SHARED_MOBILITY_MIN_ZOOM;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const remove = () => {
      if (map.getLayer(COUNTS)) map.removeLayer(COUNTS);
      if (map.getLayer(CIRCLES)) map.removeLayer(CIRCLES);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
    if (!enabled) {
      remove();
      return;
    }
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, { type: 'geojson', data: cellsToGeoJSON([]) });
      const beforeId = PIN_LAYER_IDS.find((id) => map.getLayer(id));
      map.addLayer(
        {
          id: CIRCLES,
          type: 'circle',
          source: SOURCE,
          paint: {
            'circle-color': ink(0.55),
            'circle-stroke-color': paper(0.9),
            'circle-stroke-width': 1,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'count'],
              1,
              4,
              5,
              7,
              20,
              11,
              60,
              15,
            ],
          },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: COUNTS,
          type: 'symbol',
          source: SOURCE,
          minzoom: 15,
          filter: ['>', ['get', 'count'], 1],
          layout: {
            'text-field': ['to-string', ['get', 'count']],
            'text-font': [MAP_FONT_BOLD],
            'text-size': 11,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': paper() },
        },
        beforeId,
      );
    }

    if (tooFar) {
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(cellsToGeoJSON([]));
      return;
    }

    let cancelled = false;
    const b = map.getBounds();
    void untypedRpc<SnapshotBbox>('shared_mobility_in_bbox', {
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    }).then(({ data, error }) => {
      if (cancelled || error) return;
      const cells = data?.cells ?? [];
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(cellsToGeoJSON(cells));
      setSnap({
        attribution: data?.attribution ?? null,
        generatedAt: data?.generated_at ?? null,
        cells: cells.length,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mapRef, mapReady, enabled, viewport, tooFar]);

  // Unmount: leave nothing behind on a reused map instance.
  useEffect(
    () => () => {
      const map = mapRef.current;
      if (!map?.getStyle?.()) return;
      if (map.getLayer(COUNTS)) map.removeLayer(COUNTS);
      if (map.getLayer(CIRCLES)) map.removeLayer(CIRCLES);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    },
    [mapRef],
  );

  if (!enabled) return null;
  return {
    attribution: snap?.attribution ?? null,
    generatedAt: snap?.generatedAt ?? null,
    cells: tooFar ? 0 : (snap?.cells ?? 0),
    tooFar,
  };
}
