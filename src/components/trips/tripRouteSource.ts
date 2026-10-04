import type { TripPlace } from '@/hooks/useTrips';
import {
  ENTITY_BULLET,
  areaColor,
  lineColor,
  lineFor,
  type MapRoute,
  type MapRouteStop,
  type MapStation,
} from '@/components/map/mapDomain';
import { glyphKeyFor } from '@/components/map/mapIcons';
import type { LayerType } from '@/hooks/useExploreMapData';

/** A day, as much of one as this adapter needs. */
export interface TripDayLike {
  id: string;
  day_number?: number | null;
  date?: string | null;
}

export interface TripRouteInput {
  tripId: string;
  title: string;
  places: readonly TripPlace[];
  days?: readonly TripDayLike[];
  /** `canEditTrip`. RLS remains the source of truth; this is the affordance. */
  canEdit?: boolean;
  visited?: (type: 'venue' | 'event' | 'hotel', id: string) => boolean;
}

export interface TripRouteResult {
  route: MapRoute;
  /**
   * Places that could not become a stop, and WHY. Counted and reported, never
   * silently dropped: `DiscoverMap` dropped un-geocoded trips without a word,
   * and a route that quietly closes a gap presents a wrong route as a right
   * one.
   */
  unmapped: { place: TripPlace; reason: 'no_coordinates' }[];
}

/** Which entity a trip place points at, and that entity's map layer. */
function layerFor(p: TripPlace): { layer: LayerType; entityId: string } | null {
  if (p.venue_id) return { layer: 'venues', entityId: p.venue_id };
  if (p.event_id) return { layer: 'events', entityId: p.event_id };
  if (p.hotel_id) return { layer: 'hotels', entityId: p.hotel_id };
  // A custom place (`custom_name`) is a real stop with coordinates and no
  // entity behind it. It rides the M line and links nowhere.
  return null;
}

function nameFor(p: TripPlace): string {
  return (
    p.venues?.name ??
    p.events?.title ??
    p.hotels?.name ??
    p.custom_name ??
    p.custom_address ??
    'Stop'
  );
}

/**
 * `TripPlace[]` → `MapRoute`, so a trip renders through the shared engine.
 *
 * Three things carried over from `TripMap` deliberately:
 *
 *  - the DAY SORT (`day_number`, then undated days last), so the itinerary is
 *    in the order it is lived rather than the order the rows came back;
 *  - the `'unassigned'` bucket — places with no `day_id` are still stops, and
 *    dropping them would silently shorten the route;
 *  - `sort_order` WITHIN a day, never array arrival order.
 *
 * `position` is then assigned once, across the whole trip, and is
 * AUTHORITATIVE from there on. It is never re-derived downstream: a stop that
 * cannot be resolved leaves a gap in the numbering, and the gap is the point.
 */
export function tripRoute(input: TripRouteInput): TripRouteResult {
  const { tripId, title, places, days, canEdit, visited } = input;

  // Day ordering. An undated / unnumbered day sorts last rather than first,
  // which is what a `null` would do under a naive numeric compare.
  const dayRank = new Map<string, number>();
  [...(days ?? [])]
    .sort((a, b) => (a.day_number ?? Number.MAX_SAFE_INTEGER) - (b.day_number ?? Number.MAX_SAFE_INTEGER))
    .forEach((d, i) => dayRank.set(d.id, i));

  const UNASSIGNED = Number.MAX_SAFE_INTEGER;
  const ordered = [...places].sort((a, b) => {
    const da = a.day_id != null ? (dayRank.get(a.day_id) ?? UNASSIGNED) : UNASSIGNED;
    const db = b.day_id != null ? (dayRank.get(b.day_id) ?? UNASSIGNED) : UNASSIGNED;
    if (da !== db) return da - db;
    return a.sort_order - b.sort_order;
  });

  const stops: MapRouteStop[] = [];
  const unmapped: TripRouteResult['unmapped'] = [];
  let position = 0;

  for (const p of ordered) {
    // Every stop consumes a position, resolved or not — that is what makes a
    // gap visible rather than silently closed.
    position += 1;

    if (p.latitude == null || p.longitude == null) {
      unmapped.push({ place: p, reason: 'no_coordinates' });
      continue;
    }

    const ref = layerFor(p);
    const layer: LayerType = ref?.layer ?? 'venues';
    const category = p.venues?.category ?? p.events?.event_type ?? p.category ?? undefined;
    const line = lineFor(layer, category);

    const station: MapStation = {
      // The feature-id convention. Keyed on the ENTITY where there is one, so
      // a saved / visited / hover lookup matches the same station found by
      // panning; on the trip-place row otherwise, which is still unique.
      id: ref ? `${ref.layer.slice(0, -1)}-${ref.entityId}` : `trip-place-${p.id}`,
      type: layer,
      entity: ENTITY_BULLET[layer],
      line,
      name: nameFor(p),
      subtitle: p.custom_address ?? p.venues?.address ?? p.hotels?.address ?? undefined,
      lng: p.longitude,
      lat: p.latitude,
      color: line ? lineColor(line) : areaColor(),
      iconKey: glyphKeyFor(layer, category),
      category,
      featured: false,
      live: false,
      visited: ref && visited ? visited(ref.layer.slice(0, -1) as 'venue', ref.entityId) : undefined,
      // `canEditTrip` finally reaches the map. `TripPlannerPage` has computed
      // it, gated the generator and `readOnly` with it, and never passed it to
      // the map — so viewers and editors saw an identical map.
      editable: canEdit === true,
      startDate: p.events?.start_date ?? undefined,
    };

    stops.push({
      position,
      station,
      note: p.notes ?? undefined,
      // From the stored override, falling back to nothing. No routing, no
      // estimates beyond what the trip already holds.
      arriveMode: p.arrive_mode ?? undefined,
    });
  }

  return {
    route: { id: tripId, kind: 'trip', title, stops },
    unmapped,
  };
}
