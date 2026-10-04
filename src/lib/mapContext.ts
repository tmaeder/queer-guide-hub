import { sanitizeRedirect } from '@/lib/authRedirect';
import {
  MAP_LINE_IDS,
  MAP_VIEW_IDS,
  type MapContext,
  type MapLine,
  type MapView,
} from '@/components/map/mapDomain';

/**
 * The map's context contract — what travels when a reader crosses between a
 * list, the map, a detail page and back.
 *
 * There is NO serialised blob. This reuses the params `useMapShellState`
 * already parses and adds exactly two:
 *
 *  - `station=<layer>-<id>` — restores selection, flies, opens the popup. Also
 *    the payload an auth continuation needs.
 *  - `back=<pathname+search>` — the referrer chip, filtered through the
 *    EXISTING `sanitizeRedirect`, which is already this repo's "anyone can
 *    craft this URL" filter. One implementation, not two.
 */

/**
 * Keys that may appear in a SHARED url.
 *
 * DENY BY DEFAULT, and that direction is the whole point: an allowlist of keys
 * is the only shape that survives a rename. `expect(payload.home_lat).toBeUndefined()`
 * passes on a payload that never had the field, and keeps passing after
 * someone renames it to `homeLat`.
 *
 * Three things are deliberately absent and must stay absent:
 *
 *  - `near` — the reader's PRECISE LOCATION. A shared link that carries where
 *    someone was standing is an outing risk on this platform, not a
 *    convenience.
 *  - `accessible` — contributed by `usePreferenceChips` as a one-way merge
 *    into the map's filters, never into shell or URL state. Accessibility
 *    needs are private; letting them back in through a share URL would
 *    publish a disability disclosure.
 *  - `visited` / `savedOnly` — the viewer's own history. Never another
 *    person's, and never a stranger's to read.
 */
export const SHAREABLE_PARAMS = [
  'view',
  'lines',
  'q',
  'category',
  'tags',
  'open',
  'from',
  'to',
  'era',
  'lat',
  'lng',
  'z',
  'station',
  'route',
] as const;

export type ShareableParam = (typeof SHAREABLE_PARAMS)[number];

/** Keys that must NEVER be shared. Named so the test can assert both ways. */
export const PRIVATE_PARAMS = ['near', 'accessible', 'visited', 'saved', 'back'] as const;

export interface ToMapParamsInput {
  view?: MapView;
  lines?: readonly MapLine[];
  /** `[lng, lat]`, the MapLibre order. */
  center?: [number, number];
  zoom?: number;
  query?: string;
  /** `venue-<uuid>` — the feature-id convention. */
  station?: string | null;
  /** `guide:<slug>` or `trip:<id>`. */
  route?: string | null;
  /** A path on THIS origin. Anything else is dropped, not escaped. */
  back?: string | null;
}

/**
 * Build the query string for a handoff INTO the map. Every one of these params
 * already works; nothing new is invented, which is why the two dead
 * `/map?city=` and `/map?country=` links are fixed by sending what the calling
 * component already holds (a centroid and a zoom) rather than by adding a
 * slug resolver.
 */
export function toMapParams(input: ToMapParamsInput): URLSearchParams {
  const sp = new URLSearchParams();
  if (input.view) sp.set('view', input.view);
  if (input.lines?.length) sp.set('lines', [...input.lines].join(','));
  if (input.center) {
    sp.set('lng', input.center[0].toFixed(4));
    sp.set('lat', input.center[1].toFixed(4));
  }
  if (input.zoom != null) sp.set('z', input.zoom.toFixed(2));
  if (input.query) sp.set('q', input.query);
  if (input.station) sp.set('station', input.station);
  if (input.route) sp.set('route', input.route);
  // `back` goes through the same filter the auth flow uses. A null return is
  // dropped rather than encoded — a crafted absolute URL must not survive as
  // an escaped string that some later reader un-escapes.
  const back = sanitizeRedirect(input.back ?? null);
  if (back) sp.set('back', back);
  return sp;
}

/** `/map?…` for a handoff. The one place that knows the map's path. */
export function mapUrl(input: ToMapParamsInput, base = '/map'): string {
  const qs = toMapParams(input).toString();
  return qs ? `${base}?${qs}` : base;
}

/** Read a context back out of a query string. The inverse of `toMapParams`. */
export function fromMapParams(sp: URLSearchParams): Partial<MapContext> {
  const out: Partial<MapContext> = {};

  const view = sp.get('view');
  if (view && (MAP_VIEW_IDS as readonly string[]).includes(view)) out.view = view as MapView;

  const lines = (sp.get('lines') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is MapLine => (MAP_LINE_IDS as readonly string[]).includes(s));
  if (lines.length) out.lines = [...new Set(lines)];

  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  const z = Number(sp.get('z'));
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Number.isFinite(z) &&
    sp.get('lat') != null &&
    sp.get('lng') != null &&
    sp.get('z') != null
  ) {
    out.viewport = { center: [lng, lat], zoom: z };
  }

  const q = sp.get('q');
  if (q) out.query = q;

  const station = sp.get('station');
  if (station) out.focusedStationId = station;

  // Sanitised on READ as well as on write: the URL is attacker-controlled and
  // a context can arrive from anywhere.
  const back = sanitizeRedirect(sp.get('back'));
  if (back) out.back = back;

  return out;
}

/**
 * The payload for "Share this view".
 *
 * Built by ALLOWLIST from the live query string, which also fixes a live bug:
 * `MapShell.handleShare` copied `window.location.href`, so on the four
 * `enableUrlState:false` surfaces "Share this view" shared none of the view —
 * and on `/map` it shared `near` and `back` along with it.
 */
export function shareParams(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of SHAREABLE_PARAMS) {
    const v = sp.get(key);
    if (v) out.set(key, v);
  }
  return out;
}

/** The absolute URL to share for the current view. */
export function shareUrl(origin: string, pathname: string, sp: URLSearchParams): string {
  const qs = shareParams(sp).toString();
  return qs ? `${origin}${pathname}?${qs}` : `${origin}${pathname}`;
}

/**
 * The share payload for a context the HOST owns rather than the URL — the
 * `enableUrlState:false` surfaces, where there is no query string to filter.
 */
export function shareParamsFromContext(ctx: Partial<MapContext>): URLSearchParams {
  return shareParams(
    toMapParams({
      view: ctx.view,
      lines: ctx.lines,
      center: ctx.viewport?.center,
      zoom: ctx.viewport?.zoom,
      query: ctx.query,
      station: ctx.focusedStationId ?? null,
      // `back` is deliberately NOT forwarded: a referrer is the reader's own
      // navigation history, not part of the view they are sharing.
    }),
  );
}
