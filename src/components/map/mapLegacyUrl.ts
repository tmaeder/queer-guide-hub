import type { LayerType } from '@/hooks/useExploreMapData';
import { MAP_LINE_IDS, MAP_VIEW_IDS, type MapLine, type MapView } from './mapDomain';

/**
 * Legacy `?lens=` / `?layers=` → `?view=` / `?lines=` translation.
 *
 * A PURE module, deliberately not a branch inside `useMapShellState`: that
 * hook needs a Router to instantiate, so every case here would otherwise cost
 * a render. The full 5 × 7 product is unit-tested.
 *
 * Four rules:
 *
 *  1. ONE-WAY. `view`/`lines` win when present; `lens`/`layers` are a
 *     fallback. Writes only ever emit the new keys.
 *  2. An EMPTY translation falls back to the surface default, never `[]` —
 *     `?layers=cities` yields zero lines, and returning `[]` renders a blank
 *     map. Same bug class as the `savedLayers.length > 0` guard.
 *  3. No mount-time rewrite. The legacy keys are deleted inside the existing
 *     `writeParams` callback, on the next write the user causes anyway. A
 *     normalising effect would be a URL write OUTSIDE `writeParams`, racing
 *     the 250 ms viewport timer — exactly the lost-write bug that hook's
 *     comments document. Until then both keys sit in the URL and read
 *     precedence makes `view` authoritative: stale, never contradictory.
 *  4. Prefs migrate on read, in `readPrefs()`.
 */

/** The retired lens vocabulary. Accepted from URLs forever; never written. */
export type LegacyLens = 'pins' | 'density' | 'routes' | 'boundary' | 'combined';

/**
 * `combined` collapses into `stations`, because that is what it was: pins with
 * a heat underglow, which the `stations` view now does by default.
 */
export const LEGACY_LENS_TO_VIEW: Record<LegacyLens, MapView> = {
  pins: 'stations',
  combined: 'stations',
  density: 'heat',
  boundary: 'areas',
  routes: 'routes',
};

/**
 * `null` for every area layer — geography is a VIEW now, not a line, so a URL
 * asking for `layers=cities` carries no line information at all. That is rule
 * 2's whole reason for existing.
 */
export const LEGACY_LAYER_TO_LINE: Record<string, MapLine | null> = {
  venues: 'M',
  events: 'E',
  hotels: 'T',
  restrooms: 'C',
  cities: null,
  countries: null,
  neighbourhoods: null,
};

/** Query-string keys this module translates and `writeParams` strips. */
export const LEGACY_KEYS = ['lens', 'layers'] as const;

function splitCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the view: `view` → `lens` → surface default. Never throws; an
 * unknown value in either key is ignored rather than rendered.
 */
export function readView(
  get: (key: string) => string | null,
  allowed: readonly MapView[],
  fallback: MapView,
): MapView {
  const direct = get('view');
  if (direct && (MAP_VIEW_IDS as readonly string[]).includes(direct)) {
    const v = direct as MapView;
    if (allowed.includes(v)) return v;
  }
  const legacy = get('lens');
  if (legacy && legacy in LEGACY_LENS_TO_VIEW) {
    const v = LEGACY_LENS_TO_VIEW[legacy as LegacyLens];
    if (allowed.includes(v)) return v;
  }
  return fallback;
}

/**
 * Resolve the active lines: `lines` → `layers` → surface default. An empty
 * result after translation is the DEFAULT, never an empty set (rule 2).
 */
export function readLines(
  get: (key: string) => string | null,
  allowed: readonly MapLine[],
  fallback: readonly MapLine[],
): MapLine[] {
  const direct = splitCsv(get('lines'))
    .filter((s): s is MapLine => (MAP_LINE_IDS as readonly string[]).includes(s))
    .filter((l) => allowed.includes(l));
  if (direct.length > 0) return [...new Set(direct)];

  const translated = splitCsv(get('layers'))
    .map((l) => LEGACY_LAYER_TO_LINE[l as LayerType] ?? null)
    .filter((l): l is MapLine => l != null)
    .filter((l) => allowed.includes(l));
  if (translated.length > 0) return [...new Set(translated)];

  return [...fallback];
}

/**
 * Translate the legacy keys into the new ones and THEN drop them. Called from
 * inside `writeParams` only (rule 3).
 *
 * **It must MIGRATE, not merely delete, and that distinction is a real bug I
 * shipped first.** A bare `delete` loses the translation: on a URL-state
 * surface the map emits a viewport on load, so `writeParams` fires within
 * 250 ms of arrival — and with `lens` gone and no `view` written, `readView`
 * fell through to the surface default. `/map?lens=density` therefore showed
 * Heat for a quarter of a second and then silently jumped to Stations.
 *
 * Caught by `e2e/map-shell.spec.ts`, where all four `?lens=` rows failed and
 * all three `?layers=` rows passed — an asymmetry no unit test could see,
 * because the thing that triggers it is the map's own load-time viewport
 * write.
 *
 * It runs BEFORE the caller's own mutation, which is load-bearing: run after,
 * and a user who has just selected the SURFACE DEFAULT (which deletes the
 * param, to keep URLs clean) would have the legacy view resurrected over
 * their explicit choice.
 *
 * A value equal to the surface default is omitted rather than written, so a
 * migrated URL is byte-identical to one the new chrome would have produced.
 */
export function migrateLegacy(
  sp: URLSearchParams,
  opts: {
    views: readonly MapView[];
    defaultView: MapView;
    lines: readonly MapLine[];
    defaultLines: readonly MapLine[];
  },
): void {
  if (!LEGACY_KEYS.some((k) => sp.has(k))) return;

  const get = (k: string) => sp.get(k);
  const view = readView(get, opts.views, opts.defaultView);
  const lines = readLines(get, opts.lines, opts.defaultLines);

  for (const k of LEGACY_KEYS) sp.delete(k);

  if (view !== opts.defaultView) sp.set('view', view);
  else sp.delete('view');

  const sameAsDefault =
    lines.length === opts.defaultLines.length && lines.every((l) => opts.defaultLines.includes(l));
  if (!sameAsDefault) sp.set('lines', lines.join(','));
  else sp.delete('lines');
}

/** Migrate a persisted prefs blob written under the old vocabulary (rule 4). */
export function migratePrefs(raw: unknown): { view?: MapView; lines?: MapLine[] } {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: { view?: MapView; lines?: MapLine[] } = {};

  if (typeof o.view === 'string' && (MAP_VIEW_IDS as readonly string[]).includes(o.view)) {
    out.view = o.view as MapView;
  } else if (typeof o.lens === 'string' && o.lens in LEGACY_LENS_TO_VIEW) {
    out.view = LEGACY_LENS_TO_VIEW[o.lens as LegacyLens];
  }

  if (Array.isArray(o.lines)) {
    const lines = o.lines.filter((l): l is MapLine =>
      (MAP_LINE_IDS as readonly string[]).includes(l as string),
    );
    if (lines.length > 0) out.lines = [...new Set(lines)];
  } else if (Array.isArray(o.enabledLayers)) {
    const lines = o.enabledLayers
      .map((l) => LEGACY_LAYER_TO_LINE[l as LayerType] ?? null)
      .filter((l): l is MapLine => l != null);
    if (lines.length > 0) out.lines = [...new Set(lines)];
  }

  return out;
}
