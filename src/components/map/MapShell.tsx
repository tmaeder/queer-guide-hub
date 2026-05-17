import React, { useCallback, useMemo, useRef } from 'react';
import { ExploreMap } from './ExploreMap';
import { CommandBar } from './CommandBar';
import { FilterChips } from './FilterChips';
import { useMapShellState } from '@/hooks/useMapShellState';
import {
  SURFACE_PRESETS,
  type MapShellConfig,
  type MapShellFilters,
  type MapSurface,
} from './MapShell.types';
import type { LayerType } from '@/hooks/useExploreMapData';

export interface MapShellProps {
  surface: MapSurface;
  /** Optional per-instance overrides on top of the preset (lens list, filter list, etc.) */
  configOverride?: Partial<MapShellConfig>;
  height?: number | string;
  className?: string;
  /** Initial center override [lng, lat]; supersedes URL state for non-discover surfaces */
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Skip the auto-fly to visitor geolocation */
  skipAutoFly?: boolean;
}

/**
 * Unified map shell. Composes the existing ExploreMap (Pins lens) with a
 * single top command bar, an optional row of filter chips, and the lens
 * picker. URL state (when enabled) is owned by useMapShellState.
 *
 * Phase 1 status: Pins lens fully wired; Density/Routes/Boundary lenses
 * fall through to Pins until their dedicated lens components ship. Lens
 * switching still persists via URL state.
 */
export const MapShell = ({
  surface,
  configOverride,
  height = 'calc(100dvh - 64px)',
  className,
  initialCenter,
  initialZoom,
  skipAutoFly,
}: MapShellProps) => {
  const config: MapShellConfig = useMemo(
    () => ({ ...SURFACE_PRESETS[surface], ...configOverride }),
    [surface, configOverride],
  );

  const { state, setLens, setLayers, setFilters, setViewport } = useMapShellState(config);

  // Drop filter keys we don't expose on this surface so they can't leak in via URL.
  const exposedFilters: MapShellFilters = useMemo(() => {
    const f = state.filters;
    const out: MapShellFilters = {};
    if (config.filters.includes('category') && f.category) out.category = f.category;
    if (config.filters.includes('tags') && f.tags?.length) out.tags = f.tags;
    if (config.filters.includes('near-me') && f.nearMe) out.nearMe = f.nearMe;
    if (config.filters.includes('time') && f.dateRange) out.dateRange = f.dateRange;
    if (config.filters.includes('accessibility') && f.accessible) out.accessible = f.accessible;
    if (config.filters.includes('queer-owned') && f.queerOwned) out.queerOwned = f.queerOwned;
    if (config.filters.includes('era') && f.era) out.era = f.era;
    if (f.search) out.search = f.search;
    return out;
  }, [state.filters, config.filters]);

  const removeFilter = useCallback(
    (key: keyof MapShellFilters) => {
      const next: MapShellFilters = { ...state.filters };
      delete next[key];
      setFilters(next);
    },
    [state.filters, setFilters],
  );

  // Lens → ExploreMap config adapter. Boundary auto-enables area layers
  // from the surface preset (otherwise the polygons users came to see
  // wouldn't render). Density only needs point layers (the heatmap
  // computes density from points, not boundaries).
  const exploreLayers: LayerType[] = useMemo(() => {
    const AREA: LayerType[] = ['cities', 'countries', 'neighbourhoods'];
    if (state.lens === 'boundary') {
      const presetAreas = config.layers.filter((l) => AREA.includes(l));
      const seed = presetAreas.length > 0 ? presetAreas : (['cities'] as LayerType[]);
      return Array.from(new Set([...state.enabledLayers.filter((l) => AREA.includes(l)), ...seed]));
    }
    if (state.lens === 'density') {
      return state.enabledLayers.filter((l) => l === 'venues' || l === 'events');
    }
    return state.enabledLayers;
  }, [state.lens, state.enabledLayers, config.layers]);

  const handleViewportChange = useCallback(
    (vp: { center: [number, number]; zoom: number }) => {
      setViewport(vp);
    },
    [setViewport],
  );

  const handleLayersChange = useCallback(
    (next: LayerType[]) => {
      setLayers(next);
    },
    [setLayers],
  );

  const fallbackCenter = state.viewport?.center ?? initialCenter;
  const fallbackZoom = state.viewport?.zoom ?? initialZoom;
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={containerRef}
      className={`relative ${className ?? ''}`}
      style={{ height }}
      data-map-surface={surface}
      data-map-lens={state.lens}
    >
      <ExploreMap
        height={height}
        defaultLayers={exploreLayers}
        defaultFilters={exposedFilters}
        showLayerToggles={false}
        showFilters={false}
        initialCenter={fallbackCenter}
        initialZoom={fallbackZoom}
        skipAutoFly={skipAutoFly ?? fallbackCenter != null}
        onViewportChange={handleViewportChange}
        onLayersChange={handleLayersChange}
        renderMode={state.lens === 'density' ? 'heatmap' : 'pins'}
      />

      {config.showCommandBar !== false && (
        <CommandBar
          lenses={config.lenses}
          lens={state.lens}
          onLensChange={setLens}
          availableLayers={config.layers}
          enabledLayers={state.enabledLayers}
          onLayersChange={setLayers}
          availableFilters={config.filters}
          filters={state.filters}
          onFiltersChange={setFilters}
        />
      )}

      {config.showCommandBar !== false && Object.keys(exposedFilters).length > 0 && (
        <div className="absolute top-[3.25rem] left-3 right-3 z-20">
          <FilterChips filters={exposedFilters} onRemove={removeFilter} />
        </div>
      )}
    </div>
  );
};

export default MapShell;
