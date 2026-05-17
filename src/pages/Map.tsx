import React, { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { ExploreMap } from '@/components/map/ExploreMap';
import { MapShell } from '@/components/map/MapShell';
import type { LayerType, ExploreMapFilters } from '@/hooks/useExploreMapData';
import { LAYER_DEFS } from '@/components/map/ExploreMapLayers';
import { MAP_SHELL_ENABLED } from '@/lib/featureFlags';

const PREFS_KEY = 'explore_map_prefs';

/** Parse comma-separated layer names from URL, falling back to saved prefs or defaults. */
function parseLayers(raw?: string | null): LayerType[] | undefined {
  if (!raw) return undefined;
  const valid = LAYER_DEFS.filter((d) => !d.comingSoon).map((d) => d.type);
  const parsed = raw.split(',').filter((l) => valid.includes(l as LayerType)) as LayerType[];
  return parsed.length > 0 ? parsed : undefined;
}

function parseNum(raw: string | null, min: number, max: number): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

/**
 * Full-viewport map page at /map.
 * URL state: /map?lat=52.52&lng=13.4&z=12&layers=venues,events&q=searchterm
 *  - On mount, parse URL → apply.
 *  - On moveend / chip toggle, write back via router.replace (no history pile).
 * Saved prefs in localStorage.
 */
const MapPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Load saved preferences from localStorage
  const savedPrefs = useMemo(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  // Parse URL → saved prefs → defaults
  const urlLayers = parseLayers(searchParams.get('layers'));
  const defaultLayers = urlLayers ?? savedPrefs?.layers ?? undefined;

  const lat = parseNum(searchParams.get('lat'), -90, 90);
  const lng = parseNum(searchParams.get('lng'), -180, 180);
  const z = parseNum(searchParams.get('z'), 0, 22);
  const initialCenter: [number, number] | undefined =
    lat != null && lng != null ? [lng, lat] : undefined;

  const defaultFilters: Partial<ExploreMapFilters> = {};
  const urlQuery = searchParams.get('q');
  if (urlQuery) defaultFilters.search = urlQuery;

  // Debounce URL writes during continuous panning to avoid pummeling history.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleViewportChange = useCallback(
    (vp: { center: [number, number]; zoom: number }) => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('lat', vp.center[1].toFixed(4));
            next.set('lng', vp.center[0].toFixed(4));
            next.set('z', vp.zoom.toFixed(2));
            return next;
          },
          { replace: true },
        );
      }, 250);
    },
    [setSearchParams],
  );

  const handleLayersChange = useCallback(
    (layers: LayerType[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (layers.length === 0) next.delete('layers');
          else next.set('layers', layers.join(','));
          return next;
        },
        { replace: true },
      );
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ ...savedPrefs, layers }));
      } catch {
        /* private mode / quota — ignore */
      }
    },
    [setSearchParams, savedPrefs],
  );

  if (MAP_SHELL_ENABLED) {
    return (
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 64px)' }}>
        <MapShell
          surface="discover"
          height="calc(100dvh - 64px)"
          initialCenter={initialCenter}
          initialZoom={z}
          skipAutoFly={initialCenter != null}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 64px)' }}>
      <ExploreMap
        height="calc(100dvh - 64px)"
        defaultLayers={defaultLayers}
        defaultFilters={defaultFilters}
        showLayerToggles
        showFilters
        initialCenter={initialCenter}
        initialZoom={z}
        skipAutoFly={initialCenter != null}
        onViewportChange={handleViewportChange}
        onLayersChange={handleLayersChange}
      />
    </div>
  );
};

export default MapPage;
