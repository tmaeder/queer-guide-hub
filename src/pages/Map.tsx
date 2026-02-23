import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import { ExploreMap } from '@/components/map/ExploreMap';
import type { LayerType, ExploreMapFilters } from '@/hooks/useExploreMapData';
import { LAYER_DEFS } from '@/components/map/ExploreMapLayers';

const PREFS_KEY = 'explore_map_prefs';

/** Parse comma-separated layer names from URL, falling back to saved prefs or defaults. */
function parseLayers(raw?: string | null): LayerType[] | undefined {
  if (!raw) return undefined;
  const valid = LAYER_DEFS.filter((d) => !d.comingSoon).map((d) => d.type);
  const parsed = raw.split(',').filter((l) => valid.includes(l as LayerType)) as LayerType[];
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Full-viewport map page at /map.
 * URL state: /map?layers=venues,events&q=searchterm
 * Saved prefs in localStorage.
 */
const MapPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Load saved preferences from localStorage
  const savedPrefs = useMemo(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  // Parse URL → saved prefs → defaults
  const urlLayers = parseLayers(searchParams.get('layers'));
  const defaultLayers = urlLayers ?? savedPrefs?.layers ?? undefined;

  const defaultFilters: Partial<ExploreMapFilters> = {};
  const urlQuery = searchParams.get('q');
  if (urlQuery) defaultFilters.search = urlQuery;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 64px)' }}>
      <ExploreMap
        height="calc(100vh - 64px)"
        defaultLayers={defaultLayers}
        defaultFilters={defaultFilters}
        showLayerToggles
        showFilters
      />
    </Box>
  );
};

export default MapPage;
