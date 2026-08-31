import type { TripPlace } from '@/hooks/useTrips';
import { calculateDistanceKm } from '@/utils/calculateDistance';

/**
 * How a traveller gets from one stop to the next.
 *
 * Widened from `walk | transit | drive` on 2026-08-31. The three-mode set was
 * written for hops inside one city, but a multi-city trip's legs are routinely
 * hundreds of kilometres — `/trips/discover` builds routes across borders — and
 * the planner was labelling a 900 km hop "drive, ~13 h".
 *
 * WHAT THIS IS NOT. These are labels and estimates, not a routing engine.
 * `docs/plans/2026-08-30-transit-mobility-phase-4-design.md` rules journey
 * planning permanently out of scope: it needs an origin, a destination and a
 * time of request, and that triple IS the sensitive query. Nothing here sends
 * anything anywhere. The numbers are averages the UI renders with `~`, and the
 * only way a coordinate leaves the page is a link the traveller clicks.
 */
export type TransportMode =
  'walk' | 'cycle' | 'transit' | 'drive' | 'rideshare' | 'rail' | 'ferry' | 'flight';

/**
 * The order the leg-row click-through cycles in — short to long, so a tap moves
 * one step up the ladder rather than jumping from walking to flying.
 *
 * Lives here rather than in `LegRow` because it is data, and because a
 * constant exported from a component file breaks react-refresh. Pinned
 * exhaustive over `TransportMode` by `tripLegs.test.ts`.
 */
export const MODE_ORDER: TransportMode[] = [
  'walk',
  'cycle',
  'transit',
  'drive',
  'rideshare',
  'rail',
  'ferry',
  'flight',
];

export interface TripLeg {
  /** Place the leg starts from — legs render right after this card. */
  fromId: string;
  /** Place the leg arrives at — `arrive_mode` overrides live on this row. */
  toId: string;
  /** Straight-line distance × detour factor, km. */
  distanceKm: number;
  mode: TransportMode;
  /** True when mode came from the user (trip_places.arrive_mode), not the heuristic. */
  modeOverridden: boolean;
  durationMin: number;
}

/**
 * Straight-line distances underestimate real routes; 1.3 is the usual
 * street-network detour factor for cities.
 */
const DETOUR_FACTOR = 1.3;

const WALK_KMH = 4.5;
const CYCLE_KMH = 14;
/** Effective door-to-door transit speed incl. waiting. */
const TRANSIT_KMH = 16;
const DRIVE_URBAN_KMH = 28;
const DRIVE_LONG_KMH = 70;
/** Above this leg length, driving speed switches from urban to long-haul. */
const DRIVE_LONG_THRESHOLD_KM = 40;
/** Door-to-door incl. getting to the station and the wait, not line speed. */
const RAIL_KMH = 90;
const FERRY_KMH = 35;

/**
 * A flight is the one mode a single speed cannot describe.
 *
 * Door to door, a 300 km hop and a 3,000 km hop differ by a factor of ten in
 * distance and less than two in time, because most of the cost is fixed:
 * getting to the airport, security, boarding, baggage, getting out the other
 * end. Modelling it as km/h would report 25 minutes for a short flight, which
 * is not a rounding error — it would rank flying above walking on a 30 km leg.
 */
const FLIGHT_FIXED_MIN = 180;
const FLIGHT_CRUISE_KMH = 800;

/**
 * The default mode for a leg of this length.
 *
 * A default, not a recommendation: `trip_places.arrive_mode` overrides it and
 * the override is what the traveller sees once they have chosen. Thresholds are
 * ordinary travel heuristics, deliberately coarse — there is no data here about
 * whether a rail line exists between two points, which is exactly why 700 km
 * suggests rail rather than asserting one runs.
 */
export function suggestMode(distanceKm: number): TransportMode {
  if (distanceKm <= 2) return 'walk';
  if (distanceKm <= 30) return 'transit';
  if (distanceKm <= 120) return 'drive';
  if (distanceKm <= 700) return 'rail';
  return 'flight';
}

export function legDurationMin(distanceKm: number, mode: TransportMode): number {
  if (mode === 'flight') {
    return Math.max(1, Math.round(FLIGHT_FIXED_MIN + (distanceKm / FLIGHT_CRUISE_KMH) * 60));
  }
  const speed =
    mode === 'walk'
      ? WALK_KMH
      : mode === 'cycle'
        ? CYCLE_KMH
        : mode === 'transit'
          ? TRANSIT_KMH
          : mode === 'rail'
            ? RAIL_KMH
            : mode === 'ferry'
              ? FERRY_KMH
              : // drive and rideshare are the same vehicle on the same roads;
                // what separates them is who is driving and how it is paid for,
                // neither of which changes the time.
                distanceKm > DRIVE_LONG_THRESHOLD_KM
                ? DRIVE_LONG_KMH
                : DRIVE_URBAN_KMH;
  return Math.max(1, Math.round((distanceKm / speed) * 60));
}

/**
 * Google Maps' `travelmode` for the modes it actually has.
 *
 * `null` for rail, ferry, flight and rideshare, and that is deliberate rather
 * than unfinished: Maps has no travel mode for them, so mapping them onto
 * `driving` would open a car route for a flight. A booking link would need an
 * operator, and this platform knows none — which for ride-hailing in particular
 * is a fact worth stating rather than papering over. Uber does not serve much
 * of the world, and defaulting every city to it would be wrong most loudly in
 * exactly the places this audience most needs a real local answer.
 */
export function googleMapsTravelMode(mode: TransportMode): string | null {
  switch (mode) {
    case 'walk':
      return 'walking';
    case 'cycle':
      return 'bicycling';
    case 'transit':
      return 'transit';
    case 'drive':
      return 'driving';
    default:
      return null;
  }
}

/**
 * A directions link for one leg, or null when no honest one exists.
 *
 * Outbound and user-initiated — the traveller clicks and leaves, which is the
 * same pattern `googleMapsDayUrl` has always used. Nothing is sent from here.
 */
export function legDirectionsUrl(
  from: { latitude: number | null; longitude: number | null },
  to: { latitude: number | null; longitude: number | null },
  mode: TransportMode,
): string | null {
  const travelMode = googleMapsTravelMode(mode);
  if (!travelMode) return null;
  if (from.latitude == null || from.longitude == null) return null;
  if (to.latitude == null || to.longitude == null) return null;
  const params = new URLSearchParams({
    api: '1',
    origin: `${from.latitude},${from.longitude}`,
    destination: `${to.latitude},${to.longitude}`,
    travelmode: travelMode,
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

function hasCoords(p: TripPlace): boolean {
  return p.latitude != null && p.longitude != null && p.category !== 'note';
}

/**
 * Heuristic route legs between consecutive places (in visual order).
 * Places without coordinates and day notes are skipped — a leg connects the
 * nearest locatable neighbors around them. All numbers are estimates and the
 * UI must present them as such ("~").
 */
export function buildLegs(orderedPlaces: TripPlace[]): TripLeg[] {
  const locatable = orderedPlaces.filter(hasCoords);
  const legs: TripLeg[] = [];
  for (let i = 0; i < locatable.length - 1; i++) {
    const from = locatable[i];
    const to = locatable[i + 1];
    const straight = calculateDistanceKm(
      from.latitude!,
      from.longitude!,
      to.latitude!,
      to.longitude!,
    );
    const distanceKm = straight * DETOUR_FACTOR;
    // Sub-100m legs (same building/block) are noise, skip.
    if (distanceKm < 0.1) continue;
    const override = to.arrive_mode ?? null;
    const mode = override ?? suggestMode(distanceKm);
    legs.push({
      fromId: from.id,
      toId: to.id,
      distanceKm,
      mode,
      modeOverridden: override != null,
      durationMin: legDurationMin(distanceKm, mode),
    });
  }
  return legs;
}

/** Total km walked across a day's legs — feeds packing/AI signals. */
export function totalWalkingKm(legs: TripLeg[]): number {
  return legs.filter((l) => l.mode === 'walk').reduce((sum, l) => sum + l.distanceKm, 0);
}

/**
 * Nearest-neighbor route optimization for one day: starts at the first
 * located place and greedily hops to the closest remaining one. Notes and
 * unlocated places keep their relative order, appended at the end. Good
 * enough at day granularity — real TSP is overkill for ≤15 stops.
 */
export function optimizeDayOrder(places: TripPlace[]): TripPlace[] {
  const locatable = places.filter(hasCoords);
  const rest = places.filter((p) => !hasCoords(p));
  if (locatable.length < 3) return places;

  const route: TripPlace[] = [locatable[0]];
  const remaining = locatable.slice(1);
  while (remaining.length > 0) {
    const last = route[route.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = calculateDistanceKm(
        last.latitude!,
        last.longitude!,
        remaining[i].latitude!,
        remaining[i].longitude!,
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    route.push(remaining.splice(bestIdx, 1)[0]);
  }
  return [...route, ...rest];
}

/** Google Maps directions deep link through the day's located stops. */
export function googleMapsDayUrl(places: TripPlace[]): string | null {
  const stops = places.filter(hasCoords).slice(0, 10);
  if (stops.length < 2) return null;
  const path = stops.map((p) => `${p.latitude},${p.longitude}`).join('/');
  return `https://www.google.com/maps/dir/${path}`;
}

export function formatLegDistance(km: number): string {
  if (km < 1) return `~${Math.round(km * 100) * 10} m`;
  return `~${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatLegDuration(min: number): string {
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `~${h} h` : `~${h} h ${rest} min`;
}
