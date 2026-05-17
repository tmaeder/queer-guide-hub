import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { LayerType } from '@/hooks/useExploreMapData';
import type {
  MapLens,
  MapShellConfig,
  MapShellFilters,
  MapShellState,
} from '@/components/map/MapShell.types';

const PREFS_KEY = 'map_shell_prefs';
const LENS_KEYS: MapLens[] = ['pins', 'density', 'routes', 'boundary'];

function readPrefs(): Partial<MapShellState> | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePrefs(partial: Partial<MapShellState>) {
  try {
    const prev = readPrefs() ?? {};
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prev, ...partial }));
  } catch {
    /* private mode / quota — ignore */
  }
}

function parseNum(raw: string | null, min: number, max: number): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function parseLens(raw: string | null, allowed: MapLens[]): MapLens | undefined {
  if (!raw) return undefined;
  const candidate = raw as MapLens;
  if (!LENS_KEYS.includes(candidate)) return undefined;
  return allowed.includes(candidate) ? candidate : undefined;
}

function parseLayers(raw: string | null, allowed: LayerType[]): LayerType[] | undefined {
  if (!raw) return undefined;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is LayerType => (allowed as string[]).includes(s));
  return parsed.length > 0 ? parsed : undefined;
}

export interface UseMapShellStateResult {
  state: MapShellState;
  setLens: (lens: MapLens) => void;
  setLayers: (layers: LayerType[]) => void;
  setFilters: (filters: MapShellFilters) => void;
  setViewport: (vp: { center: [number, number]; zoom: number }) => void;
}

/**
 * URL state for MapShell. When `config.enableUrlState` is true, the lens,
 * layer set, filters, and viewport sync to `?lens=…&layers=…&q=…&lat=…&lng=…&z=…`.
 * Otherwise state is kept in-memory and (optionally) `localStorage` per the
 * shared `PREFS_KEY`.
 */
export function useMapShellState(config: MapShellConfig): UseMapShellStateResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const useUrl = config.enableUrlState !== false;
  const prefs = useMemo(() => readPrefs(), []);

  const inMemoryRef = useRef<MapShellState>({
    lens: config.defaultLens,
    enabledLayers: config.layers,
    filters: {},
  });

  const lens: MapLens = useUrl
    ? parseLens(searchParams.get('lens'), config.lenses) ??
      (prefs?.lens && config.lenses.includes(prefs.lens) ? prefs.lens : config.defaultLens)
    : inMemoryRef.current.lens;

  const enabledLayers: LayerType[] = useUrl
    ? parseLayers(searchParams.get('layers'), config.layers) ??
      (prefs?.enabledLayers?.filter((l) => config.layers.includes(l)) ?? config.layers)
    : inMemoryRef.current.enabledLayers;

  const filters: MapShellFilters = useMemo(() => {
    if (!useUrl) return inMemoryRef.current.filters;
    const next: MapShellFilters = {};
    const q = searchParams.get('q');
    if (q) next.search = q;
    const cat = searchParams.get('category');
    if (cat) next.category = cat;
    const tags = searchParams.get('tags');
    if (tags) next.tags = tags.split(',').filter(Boolean);
    const nearMe = searchParams.get('near');
    if (nearMe) {
      const [lat, lng, radius] = nearMe.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius)) {
        next.nearMe = { lat, lng, radiusKm: radius };
      }
    }
    if (searchParams.get('queer_owned') === '1') next.queerOwned = true;
    const era = searchParams.get('era');
    if (era) {
      const [s, e] = era.split('-').map(Number);
      if (Number.isFinite(s) && Number.isFinite(e)) {
        next.era = { decadeStart: s, decadeEnd: e };
      }
    }
    return next;
  }, [searchParams, useUrl]);

  const viewport = useMemo(() => {
    if (!useUrl) return inMemoryRef.current.viewport;
    const lat = parseNum(searchParams.get('lat'), -90, 90);
    const lng = parseNum(searchParams.get('lng'), -180, 180);
    const z = parseNum(searchParams.get('z'), 0, 22);
    if (lat != null && lng != null && z != null) {
      return { center: [lng, lat] as [number, number], zoom: z };
    }
    return undefined;
  }, [searchParams, useUrl]);

  const setLens = useCallback(
    (next: MapLens) => {
      if (useUrl) {
        setSearchParams(
          (prev) => {
            const sp = new URLSearchParams(prev);
            if (next === config.defaultLens) sp.delete('lens');
            else sp.set('lens', next);
            return sp;
          },
          { replace: true },
        );
      } else {
        inMemoryRef.current.lens = next;
      }
      writePrefs({ lens: next });
    },
    [useUrl, setSearchParams, config.defaultLens],
  );

  const setLayers = useCallback(
    (next: LayerType[]) => {
      if (useUrl) {
        setSearchParams(
          (prev) => {
            const sp = new URLSearchParams(prev);
            if (next.length === 0) sp.delete('layers');
            else sp.set('layers', next.join(','));
            return sp;
          },
          { replace: true },
        );
      } else {
        inMemoryRef.current.enabledLayers = next;
      }
      writePrefs({ enabledLayers: next });
    },
    [useUrl, setSearchParams],
  );

  const setFilters = useCallback(
    (next: MapShellFilters) => {
      if (useUrl) {
        setSearchParams(
          (prev) => {
            const sp = new URLSearchParams(prev);
            if (next.search) sp.set('q', next.search);
            else sp.delete('q');
            if (next.category) sp.set('category', next.category);
            else sp.delete('category');
            if (next.tags?.length) sp.set('tags', next.tags.join(','));
            else sp.delete('tags');
            if (next.nearMe) {
              sp.set(
                'near',
                `${next.nearMe.lat.toFixed(4)},${next.nearMe.lng.toFixed(4)},${next.nearMe.radiusKm}`,
              );
            } else {
              sp.delete('near');
            }
            if (next.queerOwned) sp.set('queer_owned', '1');
            else sp.delete('queer_owned');
            if (next.era) sp.set('era', `${next.era.decadeStart}-${next.era.decadeEnd}`);
            else sp.delete('era');
            return sp;
          },
          { replace: true },
        );
      } else {
        inMemoryRef.current.filters = next;
      }
    },
    [useUrl, setSearchParams],
  );

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setViewport = useCallback(
    (vp: { center: [number, number]; zoom: number }) => {
      if (!useUrl) {
        inMemoryRef.current.viewport = vp;
        return;
      }
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        setSearchParams(
          (prev) => {
            const sp = new URLSearchParams(prev);
            sp.set('lat', vp.center[1].toFixed(4));
            sp.set('lng', vp.center[0].toFixed(4));
            sp.set('z', vp.zoom.toFixed(2));
            return sp;
          },
          { replace: true },
        );
      }, 250);
    },
    [useUrl, setSearchParams],
  );

  return {
    state: { lens, enabledLayers, filters, viewport },
    setLens,
    setLayers,
    setFilters,
    setViewport,
  };
}
