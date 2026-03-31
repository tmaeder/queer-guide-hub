/**
 * ContextualMap — Reusable map wrapper for detail and overview pages.
 *
 * Wraps ExploreMap with sensible defaults per context (country, city, village,
 * venue, event). Handles lazy loading consistently.
 */

import React, { Suspense } from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import type { LayerType, ExploreMapFilters } from '@/hooks/useExploreMapData';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));

type MapContext = 'country' | 'city' | 'village' | 'venue' | 'event' | 'overview';

interface ContextualMapProps {
  /** Determines default layers, zoom, and behavior */
  context: MapContext;
  /** Center point [lng, lat] */
  center?: [number, number];
  /** Initial zoom (overrides context default) */
  zoom?: number;
  /** Height in px or CSS string */
  height?: number | string;
  /** Default layer overrides */
  layers?: LayerType[];
  /** Default filter overrides */
  filters?: Partial<ExploreMapFilters>;
  /** Show layer toggles */
  showLayers?: boolean;
  /** Show filter bar */
  showFilters?: boolean;
  /** Additional CSS class */
  className?: string;
}

const CONTEXT_DEFAULTS: Record<MapContext, {
  zoom: number;
  layers: LayerType[];
  showLayers: boolean;
  showFilters: boolean;
  height: number;
}> = {
  country: {
    zoom: 5,
    layers: ['venues', 'events', 'cities'],
    showLayers: true,
    showFilters: false,
    height: 400,
  },
  city: {
    zoom: 12,
    layers: ['venues', 'events', 'neighbourhoods'],
    showLayers: true,
    showFilters: false,
    height: 400,
  },
  village: {
    zoom: 14,
    layers: ['venues', 'events'],
    showLayers: false,
    showFilters: false,
    height: 350,
  },
  venue: {
    zoom: 15,
    layers: ['venues'],
    showLayers: false,
    showFilters: false,
    height: 250,
  },
  event: {
    zoom: 14,
    layers: ['events', 'venues'],
    showLayers: false,
    showFilters: false,
    height: 250,
  },
  overview: {
    zoom: 3,
    layers: ['venues', 'events', 'cities'],
    showLayers: true,
    showFilters: true,
    height: 500,
  },
};

export const ContextualMap: React.FC<ContextualMapProps> = ({
  context,
  center,
  zoom,
  height,
  layers,
  filters,
  showLayers,
  showFilters,
  className,
}) => {
  const defaults = CONTEXT_DEFAULTS[context];

  const mapHeight = height ?? defaults.height;

  return (
    <Suspense
      fallback={
        <Skeleton
          variant="rectangular"
          height={typeof mapHeight === 'number' ? mapHeight : 400}
          sx={{ borderRadius: 2 }}
        />
      }
    >
      <Box sx={{ borderRadius: 2, overflow: 'hidden' }} className={className}>
        <ExploreMap
          height={mapHeight}
          initialCenter={center}
          initialZoom={zoom ?? defaults.zoom}
          defaultLayers={layers ?? defaults.layers}
          defaultFilters={filters}
          showLayerToggles={showLayers ?? defaults.showLayers}
          showFilters={showFilters ?? defaults.showFilters}
          skipAutoFly={!!center}
        />
      </Box>
    </Suspense>
  );
};

export default ContextualMap;
