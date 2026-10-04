/**
 * The map's domain vocabulary: LINES, VIEWS, STATIONS, ROUTES — and the one
 * registry that classifies everything onto them.
 *
 * ## Lines are not layers
 *
 * `LayerType` (7 values) is the FETCH vocabulary: the four bbox fetchers in
 * `useViewportPoints`, the area queries in `useExploreMapData`, `useAreaLayers`
 * and every `AREA_*` style key are keyed off it, and none of that changes.
 *
 * `MapLine` is the CLASSIFICATION + RENDER + CHROME vocabulary. A line is a
 * projection of (layer, category) onto four values. It does not replace
 * `LayerType` anywhere in the data path, which is what keeps the diff small.
 *
 * ## Two axes, deliberately
 *
 * A station carries BOTH an entity identity (the `V`/`E`/`H`/`R` route bullet,
 * product-wide, from `ROUTE_BULLET_MAP`) and a line identity (`M`/`E`/`C`/`T`).
 * A community centre is bullet `V` on line `C`: it is still a venue, and it is
 * not on the venues line. The line letters are their OWN namespace and must
 * never be added to `ROUTE_BULLET_MAP` — that table is the entity vocabulary
 * and already spends `C` on city/country.
 *
 * ## Why the registry lives here, with the types
 *
 * The line table IS the contract. Splitting them buys two files and no safety.
 * The only import from `useExploreMapData` is `type LayerType` — type-only, so
 * it erases at build and there is no runtime cycle (same arrangement
 * `config/mapLayers.ts` documents at its own head).
 */
import type { LayerType } from '@/hooks/useExploreMapData';
import type { MapViewport } from '@/hooks/useExploreMapData';
import type { VenueCategory } from '@/lib/venueCategories';
import { AREA_LAYERS } from '@/config/mapLayers';
import { ROUTE_BULLET_MAP, type Track } from '@/components/transit/routeBulletMap';
import { ink, trackColor } from '@/lib/mapTokens';

export type { MapViewport };

// ── Lines and views ──────────────────────────────────────────────────────────

/** The four map lines. Wayfinding identity; see the file head for why these are
 *  a separate namespace from the entity bullets. */
export type MapLine = 'M' | 'E' | 'C' | 'T';

/** Every line, in render and legend order. */
export const MAP_LINE_IDS = ['M', 'E', 'C', 'T'] as const;

/**
 * The four complete views.
 *
 * Replaces the five-lens model (`pins | density | routes | boundary |
 * combined`). `combined` is retired: `stations` IS the old combined, with a
 * quieter low-zoom heat wash and no user-visible switch. Geography moved
 * wholly into `areas`, and `routes` draws an itinerary instead of silently
 * falling through to viewport pins.
 */
export type MapView = 'stations' | 'heat' | 'areas' | 'routes';

export const MAP_VIEW_IDS = ['stations', 'heat', 'areas', 'routes'] as const;

// ── Stations ─────────────────────────────────────────────────────────────────

/**
 * The entity a station IS — a `ROUTE_BULLET_MAP` key, so the bullet on a map
 * pin, a list row and a search result all resolve from one table.
 *
 * Includes the three area entities because an area can legitimately be a pin:
 * a city search result is a point at the city centroid, not a boundary. Such a
 * station has `line: null` and paints ink, which is how area entities stay off
 * the tracks.
 */
export type MapStationEntity =
  'venue' | 'event' | 'hotel' | 'restroom' | 'city' | 'country' | 'queer_village';

/** What a station offers the reader. `directions` is always an external
 *  handoff — this app issues no routing request. */
export type MapStationAction = 'open' | 'save' | 'addToTrip' | 'share' | 'directions';

/**
 * One plottable thing, flattened and render-ready.
 *
 * This is the former `MapPointSummary` (built once from a GeoJSON feature so
 * the popup card, the hover preview and the departures board don't each
 * re-parse the `meta` blob) plus the line/state/verification fields the
 * ecosystem needs. `mapPoint.ts` keeps re-exporting the old name as a
 * deprecated alias so existing consumers need no edit.
 */
export interface MapStation {
  /** `venue-<uuid>` — the existing feature-id convention, and the key every
   *  hover/selection/saved lookup is built on. */
  id: string;
  /** The fetch layer this came from. Retained because the data path is still
   *  layer-keyed; prefer `line` for anything visual. */
  type: LayerType;
  entity: MapStationEntity;
  /** `null` for an area entity rendered as a pin — see `MapStationEntity`. */
  line: MapLine | null;
  name: string;
  subtitle?: string;
  lng: number;
  lat: number;
  linkTo?: string;
  color: string;

  // ── states ────────────────────────────────────────────────────────────────
  /** Interchange treatment: the concentric paper disc + ink ring. */
  featured: boolean;
  /** Open now, or happening now. Drives the pulse and the night dimming. */
  live: boolean;
  /** In the viewer's own favourites. */
  favorited?: boolean;
  /** In the viewer's own place marks. Never another person's — see the privacy
   *  note on `MapContext`. */
  visited?: boolean;
  /** Trip-edit affordances are allowed on this station (mirrors `canEditTrip`;
   *  RLS remains the source of truth). */
  editable?: boolean;

  // ── verification ──────────────────────────────────────────────────────────
  trustScore?: number;
  reviewStatus?: string;
  lastVerifiedAt?: string;

  actions?: readonly MapStationAction[];

  // ── display, carried from the fetchers ────────────────────────────────────
  image?: string;
  /** R2-mirrored optimized copy (always reachable) — preferred over `image`. */
  optimizedImage?: string;
  /** R2-mirrored thumbnail copy. */
  thumbImage?: string;
  /** True when `image` is a brand logo — render contained, not cropped. */
  isLogo?: boolean;
  category?: string;
  city?: string;
  openNow?: boolean | null;
  priceRange?: number | null;
  startDate?: string;
  venueName?: string;
  /** Going-count for events (social proof). */
  attendeeCount?: number;
  /** Distance from the viewer in km, filled in by the consumer when known. */
  distanceKm?: number;
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * One stop on a route.
 *
 * `position` is AUTHORITATIVE and is never re-derived from array index.
 * Survivors keep their original numbers when a stop cannot be resolved, so a
 * route missing stop 3 renders 1, 2, 4, 5 and the gap is VISIBLE. Silently
 * closing it presents a wrong route as a right one.
 */
export interface MapRouteStop {
  position: number;
  station: MapStation;
  note?: string;
  /** How the reader is meant to arrive. Display only — no routing, no
   *  estimates beyond what the trip already stores. */
  arriveMode?: string;
}

export type MapRouteKind = 'trip' | 'editorial' | 'quest' | 'pride';

export interface MapRoute {
  id: string;
  kind: MapRouteKind;
  title: string;
  /** Ordered by `position`. */
  stops: readonly MapRouteStop[];
  /** Optional dominant line for the drawn stroke. A trip route has none — days
   *  are distinguished by selection emphasis and stop number, never by hue. */
  line?: MapLine;
}

// ── The data contract ────────────────────────────────────────────────────────

/**
 * Where a map's stations come from.
 *
 * `viewport` is today's behaviour and the default. The other two mean the HOST
 * owns the set: the map renders exactly these and issues no bbox fetch. That
 * is what lets search show its ranked results, a trip show its stops and a
 * guide show its picks, instead of each silently re-fetching a different
 * dataset by viewport.
 *
 * A surface using an explicit source MUST declare `filters: []` in its preset.
 * The client-side `nearMe`/`openNow` narrowing lives inside
 * `useViewportPoints` and never runs on an explicit source, so a filter chip
 * would claim to narrow and not narrow. Owning the set means supplying it
 * pre-filtered.
 */
export type MapDataSource =
  | { kind: 'viewport' }
  | { kind: 'points'; stations: readonly MapStation[]; ordered?: boolean }
  | { kind: 'route'; route: MapRoute };

/**
 * Everything needed to reconstruct a map view elsewhere.
 *
 * PRIVACY: this is the thing that gets serialised into a shareable URL, so it
 * carries no precise location (`nearMe`), no accessibility preference and no
 * visited/saved state. Those are the viewer's own and must not travel in a
 * link — enforced by the allowlist in `shareParams`, asserted deny-by-default
 * over keys rather than by naming fields to exclude (a named exclusion keeps
 * passing after a rename).
 */
export interface MapContext {
  view: MapView;
  lines: readonly MapLine[];
  viewport?: MapViewport;
  query?: string;
  /** The station the reader was looking at, for selection restore. */
  focusedStationId?: string | null;
  /** Where they came from, for the back chip. Sanitised on read. */
  back?: string;
  route?: MapRoute;
}

// ── The line registry ────────────────────────────────────────────────────────

export interface MapLineDef {
  /** Letter on the line bullet. Its own namespace — see the file head. */
  letter: string;
  /** Fallback label; `map.lines.<id>` wins where a locale has it. */
  label: string;
  /** The `ROUTE_BULLET_MAP` key this line borrows its TRACK from, so the
   *  palette has exactly one source and `mapPalette.test.ts` can prove it. */
  bulletKey: string;
  /** Cluster aggregate property name. Must be unique across lines or two donut
   *  segments silently merge. */
  countProp: string;
  /** Fetch layers a line needs. M/C/T all include `venues`, which is what
   *  makes toggling a line free of a refetch. */
  fetchLayers: readonly LayerType[];
}

/**
 * The four lines.
 *
 * `C` deliberately does NOT include support organizations yet. `organization`
 * was removed from `VENUE_CATEGORIES` by migration `20260915140000` — "a
 * category answers what kind of place is this, and an organization is not a
 * kind of place" — and there is no `organizations` member of `LayerType` and no
 * bbox fetcher for one. Adding it is its own change; the label says community
 * and care, which is what the line actually holds.
 */
export const MAP_LINES: Record<MapLine, MapLineDef> = {
  M: {
    letter: 'M',
    label: 'Venues',
    bulletKey: 'venue',
    countProp: 'm_count',
    fetchLayers: ['venues'],
  },
  E: {
    letter: 'E',
    label: 'Events',
    bulletKey: 'event',
    countProp: 'e_count',
    fetchLayers: ['events'],
  },
  C: {
    letter: 'C',
    label: 'Community & care',
    bulletKey: 'restroom',
    countProp: 'c_count',
    fetchLayers: ['venues', 'restrooms'],
  },
  T: {
    letter: 'T',
    label: 'Travel & stay',
    bulletKey: 'hotel',
    countProp: 't_count',
    fetchLayers: ['venues', 'hotels'],
  },
};

/** A line's subway track, resolved through `ROUTE_BULLET_MAP`. */
export const lineTrack = (line: MapLine): Track =>
  ROUTE_BULLET_MAP[MAP_LINES[line].bulletKey].track;

/** A line's paint colour. A FUNCTION, never a constant: `/admin/design`
 *  publishes runtime token overrides, and a module-scope read would run before
 *  the stylesheet exists and yield an empty string MapLibre rejects. */
export const lineColor = (line: MapLine, alpha?: number): string =>
  trackColor(lineTrack(line), alpha);

/** What an area entity rendered as a pin paints. Not a track — geography is
 *  not a line on this map. */
export const areaColor = (alpha?: number): string => ink(alpha);

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Venue category → line.
 *
 * EXHAUSTIVE over `VenueCategory` on purpose: a new category in the DB CHECK
 * lands in `lib/venueCategories.ts` (which is drift-tested against the
 * constraint) and then fails to compile HERE until someone decides which line
 * it belongs on. That is louder and cheaper than a second drift test, and it
 * is why this is a `Record` and not a partial lookup with a default.
 */
const VENUE_CATEGORY_LINE: Record<VenueCategory, MapLine> = {
  bar: 'M',
  club: 'M',
  cafe: 'M',
  restaurant: 'M',
  sauna: 'M',
  cruising: 'M',
  outdoor: 'M',
  shop: 'M',
  'event-venue': 'M',
  theater: 'M',
  gallery: 'M',
  salon: 'M',
  gym: 'M',
  other: 'M',
  community_center: 'C',
  toilet: 'C',
  hotel: 'T',
};

/** Non-venue layers map straight to a line. Area layers are absent — they have
 *  no line, which `lineFor` reports as `null`. */
const LAYER_LINE: Partial<Record<LayerType, MapLine>> = {
  events: 'E',
  restrooms: 'C',
  hotels: 'T',
};

/**
 * The line a point belongs to, or `null` when it belongs to none.
 *
 * `null` is the area case and is load-bearing rather than an error path: it is
 * the invariant "areas are never a top-level line", expressed as data instead
 * of as a hand-written union a type-level test could only tautologically
 * confirm.
 *
 * An unrecognised venue category falls back to `M`. The exhaustive `Record`
 * above means that cannot happen for a legal category — the fallback covers a
 * row whose category predates a vocabulary change, which the DB CHECK should
 * prevent and historically has not always.
 */
export function lineFor(layer: LayerType, category?: string | null): MapLine | null {
  if (layer === 'venues') {
    const key = category as VenueCategory | undefined | null;
    return (key && VENUE_CATEGORY_LINE[key]) || 'M';
  }
  return LAYER_LINE[layer] ?? null;
}

/**
 * The fetch layers a set of active lines needs.
 *
 * The no-refetch property lives here: M, C and T all need `venues`, so turning
 * M off leaves the fetch set unchanged and no network call fires — only the
 * render filter narrows. Turning off the last line that needs `hotels` does
 * drop `hotels`, which is correct.
 */
export function fetchLayersForLines(lines: readonly MapLine[]): LayerType[] {
  return [...new Set(lines.flatMap((l) => MAP_LINES[l].fetchLayers))];
}

/**
 * The lines reachable from a set of fetch layers.
 *
 * The INVERSE of `fetchLayersForLines`, and behaviour-preserving against the
 * layer-toggle UI that predates the line switch: a fetched feature's line is
 * active exactly when its own layer is enabled, because a line is listed here
 * iff one of its fetch layers is. Enabling `venues` alone therefore activates
 * M, C and T — which is right, since community-centre and hotel-category
 * venues arrive in that same fetch and must still draw.
 *
 * Interim: once the chrome toggles lines directly, line state comes from the
 * URL instead and this is only needed by surfaces still expressed in layers.
 */
export function linesForLayers(layers: readonly LayerType[]): MapLine[] {
  return MAP_LINE_IDS.filter((line) => MAP_LINES[line].fetchLayers.some((l) => layers.includes(l)));
}

/**
 * Layer → the `ROUTE_BULLET_MAP` key for the same entity.
 *
 * THE one copy. This table existed verbatim three times — in
 * `useExploreMapData`, in `chrome/railDeparture` and in `chrome/LineKey`, the
 * last with a comment admitting it mirrored the first — plus a fourth partial
 * variant in `search/ResultsMapView`. `neighbourhoods → queer_village` is the
 * join no amount of de-pluralising produces, which is why it has to be a table
 * at all.
 */
export const ENTITY_BULLET: Record<LayerType, MapStationEntity> = {
  venues: 'venue',
  events: 'event',
  hotels: 'hotel',
  restrooms: 'restroom',
  cities: 'city',
  countries: 'country',
  neighbourhoods: 'queer_village',
};

const BULLET_LAYER = Object.fromEntries(
  (Object.keys(ENTITY_BULLET) as LayerType[]).map((l) => [ENTITY_BULLET[l], l]),
) as Record<MapStationEntity, LayerType>;

/**
 * Entity key → fetch layer. The inverse of `ENTITY_BULLET`.
 *
 * Accepts either spelling, because callers hold both: search results are typed
 * in the singular `search_documents` vocabulary while the map is keyed by the
 * plural layer. Replaces `TYPE_TO_MAP_KIND`, which double-keyed a partial copy
 * of this table covering four of the seven layers.
 */
export function layerForEntityKey(key: string): LayerType | undefined {
  if (key in BULLET_LAYER) return BULLET_LAYER[key as MapStationEntity];
  if (key in ENTITY_BULLET) return key as LayerType;
  return undefined;
}

/** Is this layer rendered as an area (disc + boundary) rather than a station? */
export const isAreaLayer = (layer: LayerType): boolean => AREA_LAYERS.includes(layer);
