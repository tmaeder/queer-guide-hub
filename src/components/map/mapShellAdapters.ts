import type { LayerType } from '@/hooks/useExploreMapData';
import type { MapLens } from './MapShell.types';
import { AREA_LAYERS } from '@/config/mapLayers';

/** Point-rendering mode handed to ExploreMap. */
export type RenderMode = 'pins' | 'heatmap' | 'combined';

/** Map a lens to the ExploreMap point render mode. */
export function lensToRenderMode(lens: MapLens): RenderMode {
  if (lens === 'density') return 'heatmap';
  if (lens === 'combined') return 'combined';
  return 'pins';
}

/**
 * Resolve which entity layers ExploreMap should enable for a lens.
 * - boundary: area polygons only, seeded from the preset's area layers
 * - density: heatmap is computed from points, so restrict to venues + events
 * - pins / combined: the full enabled set (combined draws pins AND heatmap)
 */
export function exploreLayersFor(
  lens: MapLens,
  enabledLayers: LayerType[],
  configLayers: LayerType[],
): LayerType[] {
  if (lens === 'boundary') {
    const presetAreas = configLayers.filter((l) => AREA_LAYERS.includes(l));
    const seed = presetAreas.length > 0 ? presetAreas : (['cities'] as LayerType[]);
    return Array.from(
      new Set([...enabledLayers.filter((l) => AREA_LAYERS.includes(l)), ...seed]),
    );
  }
  if (lens === 'density') {
    return enabledLayers.filter((l) => l === 'venues' || l === 'events');
  }
  return enabledLayers;
}

/**
 * Decide what the heatmap effect should do for a render mode.
 * - wantHeatmap: add the heatmap layer (needs at least one point layer)
 * - hidePins: hide cluster/pin layers (only the pure-density lens does this;
 *   combined keeps pins on top of the heatmap)
 */
export function heatmapRenderPlan(
  renderMode: RenderMode,
  hasPointLayers: boolean,
): { wantHeatmap: boolean; hidePins: boolean } {
  return {
    wantHeatmap: renderMode !== 'pins' && hasPointLayers,
    hidePins: renderMode === 'heatmap',
  };
}
