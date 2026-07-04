import { calculateDistanceMeters } from '@/utils/calculateDistance';
import type { ParsedPlace } from './parsePlacesFile';

export interface CandidateVenue {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
}

export interface PlaceMatch {
  place: ParsedPlace;
  venue: CandidateVenue | null;
}

/** ~300 m: same block/complex; beyond that a name hit is coincidence. */
const NAME_MATCH_RADIUS_M = 300;
/** Within ~60 m a lone coordinate hit is trustworthy even without a name. */
const GEO_ONLY_RADIUS_M = 60;

export function normalizeTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((tk) => tk.length > 2);
}

/**
 * Matches parsed places to existing QG venues: shared name token within
 * 300 m, or bare proximity within 60 m. Pure — candidates are pre-fetched
 * by the caller (bbox query).
 */
export function matchPlacesToVenues(
  places: ParsedPlace[],
  venues: CandidateVenue[],
): PlaceMatch[] {
  const usable = venues.filter((v) => v.latitude != null && v.longitude != null);
  return places.map((place) => {
    if (place.lat == null || place.lng == null) return { place, venue: null };
    const tokens = new Set(normalizeTokens(place.name));
    let best: { venue: CandidateVenue; dist: number } | null = null;
    for (const venue of usable) {
      const dist = calculateDistanceMeters(place.lat, place.lng, venue.latitude!, venue.longitude!);
      if (dist > NAME_MATCH_RADIUS_M) continue;
      const nameHit = normalizeTokens(venue.name).some((tk) => tokens.has(tk));
      if (!nameHit && dist > GEO_ONLY_RADIUS_M) continue;
      // Prefer name matches, then proximity.
      const score = dist - (nameHit ? 1000 : 0);
      if (!best || score < best.dist) best = { venue, dist: score };
    }
    return { place, venue: best?.venue ?? null };
  });
}

/** Bounding box (padded) around all located places, for the candidate query. */
export function importBbox(
  places: ParsedPlace[],
  padDeg = 0.02,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  const located = places.filter((p) => p.lat != null && p.lng != null);
  if (located.length === 0) return null;
  return {
    minLat: Math.min(...located.map((p) => p.lat!)) - padDeg,
    maxLat: Math.max(...located.map((p) => p.lat!)) + padDeg,
    minLng: Math.min(...located.map((p) => p.lng!)) - padDeg,
    maxLng: Math.max(...located.map((p) => p.lng!)) + padDeg,
  };
}
