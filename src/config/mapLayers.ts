/**
 * Map layer configuration — pure constants shared by the explore-map
 * components (`ExploreMap`, `mapShellAdapters`, …). Extracted out of
 * `ExploreMap.tsx` so the MapLibre layer IDs, area-circle geometry, and
 * boundary configs live in one place instead of being scattered through a
 * 1.7k-line component, and so `AREA_LAYERS` is defined once (it was
 * previously duplicated in `mapShellAdapters.ts`).
 */
import type { LayerType } from '@/hooks/useExploreMapData';
import type { BoundaryLayerConfig } from '@/hooks/useMapBoundaryLayers';

// ── Layer classification ─────────────────────────────────────────────────────

/** Layers rendered as native MapLibre circle + label layers (area feel). */
export const AREA_LAYERS: LayerType[] = ['cities', 'countries', 'neighbourhoods'];

/** Circle radius interpolation stops per area type: `[zoom, radiusPx][]`.
 *  Stops grow the disc as you zoom in so a country reads as a broad region at
 *  world zoom and a city/neighbourhood tightens to its locale. */
export const AREA_RADIUS: Record<string, [number, number][]> = {
  countries: [
    [1, 8],
    [3, 18],
    [5, 40],
    [7, 80],
    [9, 150],
    [12, 280],
  ],
  cities: [
    [2, 4],
    [4, 8],
    [6, 16],
    [8, 28],
    [10, 45],
    [14, 75],
  ],
  neighbourhoods: [
    [2, 3],
    [4, 6],
    [6, 12],
    [8, 22],
    [10, 38],
    [14, 60],
  ],
};

/**
 * Circle style per area type. Fills are deliberately light so the translucent
 * discs read as gentle density hints, not solid blobs; `opacityHover` deepens
 * the fill on hover for a responsive cue. Thin rings keep them refined.
 */
export const AREA_STYLE: Record<
  string,
  { opacity: number; opacityHover: number; strokeOpacity: number; minLabelZoom: number }
> = {
  countries: { opacity: 0.12, opacityHover: 0.22, strokeOpacity: 0.5, minLabelZoom: 1 },
  cities: { opacity: 0.13, opacityHover: 0.24, strokeOpacity: 0.55, minLabelZoom: 3 },
  neighbourhoods: { opacity: 0.16, opacityHover: 0.28, strokeOpacity: 0.6, minLabelZoom: 6 },
};

// ── MapLibre layer / source IDs for point data ───────────────────────────────

export const POINTS_SOURCE = 'points-source';
export const CLUSTERS_LAYER = 'clusters';
export const CLUSTER_COUNT_LAYER = 'cluster-count';
export const UNCLUSTERED_LAYER = 'unclustered-point';
export const GLYPH_LAYER = 'pin-glyph';
export const FEATURED_RING_LAYER = 'featured-ring';
export const PULSE_LAYER = 'live-pulse';
export const HEATMAP_SOURCE = 'heatmap-source';
export const HEATMAP_LAYER = 'heatmap-layer';
export const FOCUS_SOURCE = 'focus-source';
export const FOCUS_RING_LAYER = 'focus-ring';

/** All point render layers; used for bulk visibility toggles between the pins
 *  and the pure-density (heatmap) lens. */
export const PIN_LAYER_IDS = [
  PULSE_LAYER,
  FEATURED_RING_LAYER,
  CLUSTERS_LAYER,
  CLUSTER_COUNT_LAYER,
  UNCLUSTERED_LAYER,
  GLYPH_LAYER,
];

// ── Boundary configs ─────────────────────────────────────────────────────────

export const COUNTRY_BOUNDARY_CONFIG: BoundaryLayerConfig = {
  key: 'countries',
  entityType: 'countries',
  matchKey: 'ISO_A2',
  matchMode: 'code',
  minLabelZoom: 1,
};

export const CITY_BOUNDARY_CONFIG: BoundaryLayerConfig = {
  key: 'cities',
  entityType: 'cities',
  matchKey: 'entity_id',
  matchMode: 'entityId',
  minLabelZoom: 4,
  minLayerZoom: 4,
};

export const NEIGHBOURHOOD_BOUNDARY_CONFIG: BoundaryLayerConfig = {
  key: 'neighbourhoods',
  entityType: 'neighbourhoods',
  matchKey: 'entity_id',
  matchMode: 'entityId',
  minLabelZoom: 8,
  minLayerZoom: 8,
};

// ── Default viewport ─────────────────────────────────────────────────────────

export const DEFAULT_CENTER: [number, number] = [0, 20];
export const DEFAULT_ZOOM = 2.2;
