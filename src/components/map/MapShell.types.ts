import type { LayerType, ExploreMapFilters } from '@/hooks/useExploreMapData';
import {
  MAP_LINES,
  MAP_LINE_IDS,
  type MapDataSource,
  type MapLine,
  type MapView,
} from './mapDomain';

export type MapSurface =
  | 'discover'
  | 'search'
  | 'venues'
  | 'city'
  | 'country'
  | 'trip'
  | 'travel'
  | 'admin';

export type MapFilterKey =
  | 'category'
  | 'tags'
  | 'near-me'
  | 'time'
  | 'accessibility'
  | 'queer-owned'
  | 'price'
  | 'safety'
  | 'era';

export interface MapShellFilters extends ExploreMapFilters {
  queerOwned?: boolean;
  era?: { decadeStart: number; decadeEnd: number };
}

export interface MapShellConfig {
  surface: MapSurface;
  /** Views this surface offers. `combined` is retired — see mapLegacyUrl. */
  views: MapView[];
  defaultView: MapView;
  /** Lines this surface offers. The POINT vocabulary, in full. */
  lines: MapLine[];
  /** Lines on at boot. Must be a subset of `lines`; defaults to all of them. */
  defaultLines?: MapLine[];
  /**
   * Area layers the `areas` view draws. Geography is a VIEW, so these are
   * deliberately NOT in `lines` — the line switch would otherwise offer a
   * toggle for something no line renders. Defaults to `['cities']`.
   */
  areaLayers?: LayerType[];
  filters: MapFilterKey[];
  showCommandBar?: boolean;
  /** Show the search field inside the command bar. Default true. Set false to
   *  keep view/filter/line controls but drop the on-map search (e.g. the
   *  homepage, where the global top-bar search is the single search). */
  showSearch?: boolean;
  enableUrlState?: boolean;
}

export interface MapShellState {
  view: MapView;
  lines: MapLine[];
  filters: MapShellFilters;
  viewport?: { center: [number, number]; zoom: number };
}

export const FILTER_LABELS: Record<MapFilterKey, string> = {
  category: 'Category',
  tags: 'Tags',
  'near-me': 'Near me',
  time: 'Time',
  accessibility: 'Accessibility',
  'queer-owned': 'Queer-owned',
  price: 'Price',
  safety: 'Safety',
  era: 'Era',
};

/**
 * DISPLAY labels only. The KEYS are URL state (`?view=…`), so renaming them
 * breaks every shared link — the transit vocabulary is what the reader sees,
 * not what the query string carries.
 *
 * These are the FALLBACK: chrome renders
 * `t('map.view.<key>', { defaultValue: VIEW_LABELS[key] })`, so
 * `public/locales/en.json` wins wherever it has a value. Both must move
 * together or the rename is invisible in the running app.
 */
export const VIEW_LABELS: Record<MapView, string> = {
  stations: 'Stations',
  heat: 'Heat',
  areas: 'Areas',
  routes: 'Routes',
};

/** Line labels, same fallback contract under `map.lines.<letter>`. */
export const LINE_LABELS: Record<MapLine, string> = Object.fromEntries(
  MAP_LINE_IDS.map((l) => [l, MAP_LINES[l].label]),
) as Record<MapLine, string>;

const ALL_LINES: MapLine[] = [...MAP_LINE_IDS];

export const SURFACE_PRESETS: Record<MapSurface, MapShellConfig> = {
  discover: {
    surface: 'discover',
    /**
     * `routes` is here because `/map` is the surface that resolves
     * `?route=guide:<slug>` / `?route=trip:<id>` — a curated route is READ on
     * the public map, not only inside the trip planner.
     *
     * Omitting it was a silent fall-through at the ALLOWLIST level, one layer
     * above the renderer: `readView` dropped the unoffered view, `/map?view=routes`
     * resolved to `stations`, and the reader got viewport pins for a route
     * request — exactly what `viewRenderPlan`'s routes branch exists to stop.
     * Caught by `e2e/map-shell.spec.ts`, which looked for the "no route"
     * notice and found station pins.
     */
    views: ['stations', 'heat', 'areas', 'routes'],
    defaultView: 'stations',
    lines: ALL_LINES,
    areaLayers: ['cities', 'countries', 'neighbourhoods'],
    // Only data-backed filters are exposed. accessibility_attributes and
    // target_groups would empty the map; era has no point layer to act on.
    filters: ['category', 'tags', 'near-me', 'time'],
    showCommandBar: true,
    enableUrlState: true,
  },
  /**
   * `filters: []` is the CONTRACT, not an oversight. Search owns its result
   * set (`source: {kind:'points'}`), so the client-side narrowing in
   * `useViewportPoints` never runs — a filter chip here would claim to narrow
   * and not narrow. A `points`/`route` surface supplies pre-filtered stations;
   * that is what owning the set means. Asserted in surfacePresets.test.ts.
   */
  search: {
    surface: 'search',
    views: ['stations'],
    defaultView: 'stations',
    lines: ALL_LINES,
    filters: [],
    showCommandBar: true,
    enableUrlState: false,
  },
  // The /venues directory map. The M line only — the page is already scoped to
  // venues — and no URL state, because the page owns its own query string.
  venues: {
    surface: 'venues',
    views: ['stations', 'heat'],
    defaultView: 'stations',
    lines: ['M'],
    filters: ['category', 'tags', 'near-me'],
    showCommandBar: true,
    enableUrlState: false,
  },
  city: {
    surface: 'city',
    views: ['stations', 'heat', 'areas'],
    defaultView: 'stations',
    lines: ALL_LINES,
    areaLayers: ['neighbourhoods'],
    filters: ['category', 'tags', 'time'],
    showCommandBar: true,
    enableUrlState: false,
  },
  country: {
    surface: 'country',
    views: ['stations', 'areas'],
    defaultView: 'areas',
    lines: ['M', 'E'],
    areaLayers: ['cities'],
    filters: ['category'],
    showCommandBar: true,
    enableUrlState: false,
  },
  /**
   * REVIVED rather than deleted: `viewRenderPlan`'s `routes` branch is what
   * makes this preset reachable, and stage 4 is its call site.
   */
  trip: {
    surface: 'trip',
    views: ['routes', 'stations'],
    defaultView: 'routes',
    lines: ALL_LINES,
    filters: [],
    showCommandBar: false,
    enableUrlState: false,
  },
  // /travel destination-discovery embed at world altitude — the E line plus
  // geography. Deliberately no M line (that is /map's job).
  travel: {
    surface: 'travel',
    views: ['stations', 'areas'],
    defaultView: 'areas',
    lines: ['E'],
    areaLayers: ['cities', 'neighbourhoods'],
    filters: [],
    showCommandBar: true,
    showSearch: false,
    enableUrlState: false,
  },
  /**
   * The pinned CANARY: admin takes a preset with no `configOverride`, and
   * `surfacePresets.test.ts` asserts it offers a superset of every view and
   * every line any other surface exposes. A view that renders nowhere else is
   * exercised here first.
   */
  admin: {
    surface: 'admin',
    views: ['stations', 'heat', 'areas', 'routes'],
    defaultView: 'stations',
    lines: ALL_LINES,
    areaLayers: ['cities', 'countries', 'neighbourhoods'],
    filters: ['category', 'time'],
    showCommandBar: true,
    enableUrlState: true,
  },
};

export type { MapDataSource };
