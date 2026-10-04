import type { LayerType } from '@/hooks/useExploreMapData';
import type { MapLine, MapView } from './mapDomain';
import { fetchLayersForLines } from './mapDomain';
import {
  AREA_LAYERS,
  HEATMAP_LAYER,
  PIN_LAYER_IDS,
  ROUTE_LAYER_IDS,
} from '@/config/mapLayers';
import type { MapShellConfig } from './MapShell.types';

/**
 * How much heat the view wants. `wash` is the quiet low-zoom underglow the
 * `stations` view carries; `full` is the dedicated heat view. See
 * `HEAT_OPACITY_WASH` / `HEAT_OPACITY_FULL` in config/mapLayers.
 */
export type HeatMode = 'off' | 'full' | 'wash';

export interface ViewRenderPlan {
  /** Draw station pins + clusters. */
  stations: boolean;
  heat: HeatMode;
  /** Draw area circles / boundary polygons. */
  areas: boolean;
  /** Draw the route line + numbered stops. */
  routes: boolean;
  /** Every MapLibre layer id this view mounts. The invariant surface. */
  layers: string[];
}

/**
 * THE view model. One function decides everything a view renders, replacing
 * `lensToRenderMode` + `heatmapRenderPlan` + `exploreLayersFor`, which were
 * three partial answers that could disagree — and did: `routes` had no branch
 * in any of them, so selecting it silently rendered viewport pins.
 *
 * `hasRoute` is a fact about the DATA, not a setting. Routes with nothing to
 * draw renders nothing and says so (`MapNotice`); it must never degrade into
 * Stations, because a map that quietly shows you a different thing than you
 * asked for is worse than an empty one.
 */
export function viewRenderPlan(
  view: MapView,
  // Part of the signature on purpose, and deliberately unread: invariant A is
  // "the plan is the same for EVERY line subset, including the empty one", so
  // a plan that varied with the lines would be the bug. Taking the parameter
  // is what lets the test sweep all 16 subsets against one contract.
  _lines: readonly MapLine[],
  hasRoute: boolean,
): ViewRenderPlan {
  switch (view) {
    case 'heat':
      return { stations: false, heat: 'full', areas: false, routes: false, layers: [HEATMAP_LAYER] };

    case 'areas':
      // Boundary polygons and area circles are mounted by
      // `useMapBoundaryLayers` / the area-circle effect, which key off their
      // own enabled set rather than off ids listed here.
      return { stations: false, heat: 'off', areas: true, routes: false, layers: [] };

    case 'routes':
      return {
        stations: hasRoute,
        heat: 'off',
        areas: false,
        routes: hasRoute,
        layers: hasRoute ? [...ROUTE_LAYER_IDS, ...PIN_LAYER_IDS] : [],
      };

    case 'stations':
    default:
      // The heatmap source mounts ALWAYS here, at wash opacity, so the
      // low-zoom density read needs no mode switch and no refetch.
      return {
        stations: true,
        heat: 'wash',
        areas: false,
        routes: false,
        layers: [...PIN_LAYER_IDS, HEATMAP_LAYER],
      };
  }
}

/**
 * Which area layers the `areas` view draws. Preserves the previous
 * `exploreLayersFor('boundary', …)` seeding: the preset's own area layers,
 * falling back to cities so the view is never blank.
 */
export function areaLayersForSurface(config: MapShellConfig): LayerType[] {
  const preset = (config.areaLayers ?? []).filter((l) => AREA_LAYERS.includes(l));
  return preset.length > 0 ? preset : (['cities'] as LayerType[]);
}

/**
 * The layer set ExploreMap should FETCH for a plan. Point layers come from the
 * lines (so toggling a line off changes no fetch key — see
 * `fetchLayersForLines`); area layers are added only by the `areas` view.
 */
export function fetchLayersForPlan(
  plan: ViewRenderPlan,
  lines: readonly MapLine[],
  config: MapShellConfig,
): LayerType[] {
  const points = plan.stations || plan.heat !== 'off' ? fetchLayersForLines(lines) : [];
  const areas = plan.areas ? areaLayersForSurface(config) : [];
  return [...new Set([...points, ...areas])];
}
