import type { TripPlace } from '@/hooks/useTrips';
import { calculateDistanceKm } from '@/utils/calculateDistance';

export type TransportMode = 'walk' | 'transit' | 'drive';

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
/** Effective door-to-door transit speed incl. waiting. */
const TRANSIT_KMH = 16;
const DRIVE_URBAN_KMH = 28;
const DRIVE_LONG_KMH = 70;
/** Above this leg length, driving speed switches from urban to long-haul. */
const DRIVE_LONG_THRESHOLD_KM = 40;

export function suggestMode(distanceKm: number): TransportMode {
  if (distanceKm <= 2) return 'walk';
  if (distanceKm <= 30) return 'transit';
  return 'drive';
}

export function legDurationMin(distanceKm: number, mode: TransportMode): number {
  const speed =
    mode === 'walk'
      ? WALK_KMH
      : mode === 'transit'
        ? TRANSIT_KMH
        : distanceKm > DRIVE_LONG_THRESHOLD_KM
          ? DRIVE_LONG_KMH
          : DRIVE_URBAN_KMH;
  return Math.max(1, Math.round((distanceKm / speed) * 60));
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
