/* eslint-disable react-hooks/refs -- "latest value" ref idiom: state values are mirrored into refs so callbacks defined here read the freshest value without re-creating identity. */
import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { MapLine, MapView } from '@/components/map/mapDomain';
import { migrateLegacy, migratePrefs, readLines, readView } from '@/components/map/mapLegacyUrl';
import type {
  MapShellConfig,
  MapShellFilters,
  MapShellState,
} from '@/components/map/MapShell.types';

const PREFS_KEY = 'map_shell_prefs';

/**
 * Prefs are MIGRATED on read, never on write: a blob saved under the old
 * `{lens, enabledLayers}` vocabulary still answers "what did this reader
 * last choose", and rewriting it at mount would be a second writer racing
 * the one below. `migratePrefs` is pure and unit-tested.
 */
function readPrefs(): Partial<MapShellState> | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const migrated = migratePrefs(parsed);
    return { ...parsed, ...migrated } as Partial<MapShellState>;
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

export interface UseMapShellStateResult {
  state: MapShellState;
  setView: (view: MapView) => void;
  setLines: (lines: MapLine[]) => void;
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

  /**
   * Every URL write goes through here, and none of them may use
   * `setSearchParams`'s functional form.
   *
   * That form does not receive the live query string: React Router closes over
   * the `searchParams` of the render that produced this particular
   * `setSearchParams` identity, and documents the consequence — "Multiple calls
   * to setSearchParams in the same tick will not build on the prior value."
   * `setViewport` debounces 250 ms, so its callback outlives its render by
   * design and its snapshot is routinely stale by the time it fires.
   *
   * The effect was a silently lost write: click a lens inside that window and
   * the viewport timer rebuilt the query string without it, so `?lens=density`
   * vanished while `data-map-lens` still read `density` (React state, not URL
   * state) — the view rendered correctly and could not be shared. Reading the
   * ref instead makes each write build on the last one we issued, whether that
   * was this tick or 250 ms ago.
   */
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;

  const writeParams = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(paramsRef.current);
      // Rule 3 of mapLegacyUrl: the legacy keys die HERE, on a write that was
      // going to happen anyway — never in a mount-time effect, which would be
      // a URL write outside this function and would race the 250 ms viewport
      // timer.
      //
      // BEFORE `mutate`, deliberately. Run it after and a user who has just
      // picked the surface default — which deletes the param, to keep URLs
      // clean — would have the legacy view resurrected over their choice.
      migrateLegacy(sp, {
        views: config.views,
        defaultView: config.defaultView,
        lines: config.lines,
        defaultLines: config.defaultLines ?? config.lines,
      });
      mutate(sp);
      paramsRef.current = sp;
      setSearchParams(sp, { replace: true });
    },
    [setSearchParams, config.views, config.defaultView, config.lines, config.defaultLines],
  );

  /**
   * Saved prefs are the fallback for "no param in the URL", and this hook is
   * also what writes them — so a mount-time snapshot goes stale the moment the
   * user changes anything, and choosing the SURFACE DEFAULT became impossible:
   * `setView` deletes the param for the default (URLs stay clean), the read
   * path then fell through to the snapshot, and the previous view reinstated
   * itself. With `heat` saved, clicking Stations removed `?view=heat` and left
   * the map on Heat — no error, no way out except clearing localStorage.
   * The ref tracks what we have actually written.
   */
  const initialPrefs = useMemo(() => readPrefs(), []);
  const prefsRef = useRef(initialPrefs);
  const prefs = prefsRef.current;
  const savePrefs = useCallback((partial: Partial<MapShellState>) => {
    prefsRef.current = { ...(prefsRef.current ?? {}), ...partial };
    writePrefs(partial);
  }, []);

  const defaultLines = useMemo<MapLine[]>(
    () => config.defaultLines ?? config.lines,
    [config.defaultLines, config.lines],
  );

  const inMemoryRef = useRef<MapShellState>({
    view: config.defaultView,
    lines: defaultLines,
    filters: {},
  });

  // An empty saved set must fall back to the surface defaults, NOT persist as
  // "nothing". `[] ?? config.lines` does not fall back (an empty array isn't
  // nullish), so a once-saved `lines: []` would render a blank map on every
  // bare /map visit. `readLines` guards on length for the same reason.
  const savedLines = prefs?.lines?.filter((l) => config.lines.includes(l));
  const prefLines = savedLines && savedLines.length > 0 ? savedLines : defaultLines;
  const prefView =
    prefs?.view && config.views.includes(prefs.view) ? prefs.view : config.defaultView;

  const getParam = useCallback((key: string) => searchParams.get(key), [searchParams]);

  const view: MapView = useUrl
    ? readView(getParam, config.views, prefView)
    : inMemoryRef.current.view;

  const lines: MapLine[] = useUrl
    ? readLines(getParam, config.lines, prefLines)
    : inMemoryRef.current.lines;

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
    if (searchParams.get('open') === '1') next.openNow = true;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from && to) next.dateRange = { start: from, end: to };
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

  const setView = useCallback(
    (next: MapView) => {
      if (useUrl) {
        writeParams((sp) => {
          if (next === config.defaultView) sp.delete('view');
          else sp.set('view', next);
        });
      } else {
        inMemoryRef.current.view = next;
      }
      savePrefs({ view: next });
    },
    [useUrl, writeParams, savePrefs, config.defaultView],
  );

  const setLines = useCallback(
    (next: MapLine[]) => {
      if (useUrl) {
        writeParams((sp) => {
          if (next.length === 0) sp.delete('lines');
          else sp.set('lines', next.join(','));
        });
      } else {
        inMemoryRef.current.lines = next;
      }
      savePrefs({ lines: next });
    },
    [useUrl, writeParams, savePrefs],
  );

  const setFilters = useCallback(
    (next: MapShellFilters) => {
      if (useUrl) {
        writeParams((sp) => {
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
          if (next.openNow) sp.set('open', '1');
          else sp.delete('open');
          if (next.dateRange) {
            sp.set('from', next.dateRange.start);
            sp.set('to', next.dateRange.end);
          } else {
            sp.delete('from');
            sp.delete('to');
          }
          if (next.era) sp.set('era', `${next.era.decadeStart}-${next.era.decadeEnd}`);
          else sp.delete('era');
        });
      } else {
        inMemoryRef.current.filters = next;
      }
    },
    [useUrl, writeParams],
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
        // 250 ms after the render that scheduled this. Anything the user
        // changed in between is in `paramsRef`, not in this closure.
        writeParams((sp) => {
          sp.set('lat', vp.center[1].toFixed(4));
          sp.set('lng', vp.center[0].toFixed(4));
          sp.set('z', vp.zoom.toFixed(2));
        });
      }, 250);
    },
    [useUrl, writeParams],
  );

  return {
    state: { view, lines, filters, viewport },
    setView,
    setLines,
    setFilters,
    setViewport,
  };
}
