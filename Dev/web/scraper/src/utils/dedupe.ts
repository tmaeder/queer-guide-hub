import { extractDomain, normalizeCity, levenshteinSimilarity } from './text.js';
import type { EntityType } from '../types/index.js';
import { childLogger } from './logger.js';

const log = childLogger('dedupe');

export interface DedupeCandidate {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  website?: string | null;
  lat?: number | null;
  lng?: number | null;
  entityType: EntityType;
}

export type DedupeMethod =
  | 'name_city_website'
  | 'name_address'
  | 'fuzzy'
  | 'geo_name'
  | 'domain_city';

export interface DedupeMatch {
  entityA: string;
  entityB: string;
  method: DedupeMethod;
  confidence: number;
}

const NAME_SIM_STRONG = 0.8;
const NAME_SIM_FUZZY = 0.9;
const NAME_SIM_GEO = 0.7;
const GEO_MATCH_METERS = 150;

/**
 * Great-circle distance in meters between two lat/lng points.
 * Returns Infinity if either coord is missing.
 */
function haversineMeters(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined,
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Evaluate all matching rules between two candidates and return the best
 * match (highest confidence) or null.
 *
 * Rule ordering (strongest first):
 *   1. name_city_website — name ≈ + same domain + same city
 *   2. domain_city       — same domain + same city (even on weaker name sim)
 *   3. name_address      — name ≈ + address ≈
 *   4. geo_name          — geo < 150 m + name ≈ (catches renames)
 *   5. fuzzy             — name very similar in same city (weakest)
 */
function compare(a: DedupeCandidate, b: DedupeCandidate): DedupeMatch | null {
  if (a.entityType !== b.entityType) return null;

  const sameCity =
    !!a.city && !!b.city && normalizeCity(a.city) === normalizeCity(b.city);
  const domainA = a.website ? extractDomain(a.website) : '';
  const domainB = b.website ? extractDomain(b.website) : '';
  const sameDomain = !!domainA && domainA === domainB;
  const nameSim = levenshteinSimilarity(a.name, b.name);

  let best: DedupeMatch | null = null;
  const consider = (method: DedupeMethod, confidence: number) => {
    if (!best || confidence > best.confidence) {
      best = { entityA: a.id, entityB: b.id, method, confidence: Math.min(1, confidence) };
    }
  };

  // 1. name + city + website domain
  if (sameDomain && sameCity && nameSim > NAME_SIM_STRONG) {
    consider('name_city_website', nameSim * 1.1);
  }

  // 2. domain-only (city required to avoid chain collisions, e.g. Starbucks)
  if (sameDomain && sameCity) {
    consider('domain_city', 0.9);
  }

  // 3. name + address
  if (a.address && b.address) {
    const addrSim = levenshteinSimilarity(a.address, b.address);
    if (nameSim > NAME_SIM_STRONG && addrSim > NAME_SIM_STRONG) {
      consider('name_address', (nameSim + addrSim) / 2);
    }
  }

  // 4. geo + name
  const dist = haversineMeters(a.lat, a.lng, b.lat, b.lng);
  if (dist <= GEO_MATCH_METERS && nameSim >= NAME_SIM_GEO) {
    // Strong confidence when they're very close AND name matches.
    // Scale 1.0 at 0m, 0.85 at the threshold.
    const proximity = 1 - dist / (GEO_MATCH_METERS * 2);
    consider('geo_name', Math.max(0.85, nameSim * 0.9 + proximity * 0.1));
  }

  // 5. fuzzy in same city (weakest)
  if (sameCity && nameSim > NAME_SIM_FUZZY) {
    consider('fuzzy', nameSim * 0.7);
  }

  return best;
}

/**
 * Find duplicate candidates from a list of entities.
 * Returns all pairs that matched under any rule, keyed by highest confidence.
 */
export function findDuplicates(entities: DedupeCandidate[]): DedupeMatch[] {
  const matches: DedupeMatch[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const match = compare(entities[i], entities[j]);
      if (match) matches.push(match);
    }
  }
  log.info({ candidateCount: entities.length, matchCount: matches.length }, 'Dedupe scan complete');
  return matches;
}

/**
 * Return the highest-confidence match for a candidate against a list of
 * existing entities, or null.
 */
export function findBestMatch(
  candidate: DedupeCandidate,
  existing: DedupeCandidate[],
): DedupeMatch | null {
  let best: DedupeMatch | null = null;
  for (const entity of existing) {
    if (entity.id === candidate.id) continue;
    const match = compare(candidate, entity);
    if (match && (!best || match.confidence > best.confidence)) best = match;
  }
  return best;
}
