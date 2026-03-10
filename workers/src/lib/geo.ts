/**
 * Shared geospatial utilities.
 * Uses Rust/Wasm for batch operations when available, falls back to TypeScript.
 */

import {
  haversine_km as wasmHaversineKm,
  batch_nearest as wasmBatchNearest,
  point_in_polygon as wasmPointInPolygon,
} from '../../wasm/pkg/geo_wasm/geo_wasm';
import { clean_html_entities as wasmCleanHtmlEntities } from '../../wasm/pkg/text_utils_wasm/text_utils_wasm';

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  try {
    return wasmHaversineKm(lat1, lon1, lat2, lon2);
  } catch {
    return haversineKmFallback(lat1, lon1, lat2, lon2);
  }
}

function haversineKmFallback(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest N points from an origin.
 * Returns array of [index, distance_km] pairs sorted by distance.
 *
 * Uses Wasm for batch processing (avoids per-point FFI overhead).
 * Falls back to TS if Wasm is unavailable.
 */
export function batchNearest(
  originLat: number,
  originLon: number,
  points: Array<{ lat: number; lon: number }>,
  limit: number,
): Array<[number, number]> {
  try {
    const pointsJson = JSON.stringify(points.map((p) => [p.lat, p.lon]));
    const result = wasmBatchNearest(originLat, originLon, pointsJson, limit);
    return JSON.parse(result);
  } catch {
    // TS fallback
    const distances = points.map((p, i) => ({
      index: i,
      distance: haversineKmFallback(originLat, originLon, p.lat, p.lon),
    }));
    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, limit).map((d) => [d.index, d.distance]);
  }
}

/**
 * Check if a point is inside a polygon (ray casting algorithm).
 */
export function pointInPolygon(
  lat: number,
  lon: number,
  polygon: Array<{ lat: number; lon: number }>,
): boolean {
  try {
    const polygonJson = JSON.stringify(polygon.map((p) => [p.lat, p.lon]));
    return wasmPointInPolygon(lat, lon, polygonJson);
  } catch {
    // TS fallback
    const n = polygon.length;
    if (n < 3) return false;
    let inside = false;
    let j = n - 1;
    for (let i = 0; i < n; i++) {
      const yi = polygon[i].lat, xi = polygon[i].lon;
      const yj = polygon[j].lat, xj = polygon[j].lon;
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
      j = i;
    }
    return inside;
  }
}

/** Normalize common country name variants, 2-letter codes, and demonyms. */
export const COUNTRY_ALIASES: Record<string, string> = {
  us: 'United States', usa: 'United States', 'united states of america': 'United States',
  gb: 'United Kingdom', uk: 'United Kingdom', 'great britain': 'United Kingdom',
  england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom',
  de: 'Germany', fr: 'France', es: 'Spain', it: 'Italy',
  nl: 'Netherlands', holland: 'Netherlands', 'the netherlands': 'Netherlands',
  ch: 'Switzerland', at: 'Austria', au: 'Australia', ca: 'Canada',
  br: 'Brazil', mx: 'Mexico', jp: 'Japan', za: 'South Africa',
  nz: 'New Zealand', il: 'Israel', th: 'Thailand', pt: 'Portugal',
  be: 'Belgium', se: 'Sweden', dk: 'Denmark', no: 'Norway', fi: 'Finland',
  ie: 'Ireland', cz: 'Czech Republic', czechia: 'Czech Republic',
  tw: 'Taiwan', ar: 'Argentina', co: 'Colombia', cl: 'Chile', pe: 'Peru',
  in: 'India', cn: 'China', kr: 'South Korea', ru: 'Russia',
  tr: 'Turkey', gr: 'Greece', pl: 'Poland', ro: 'Romania', hu: 'Hungary',
  ph: 'Philippines', id: 'Indonesia', ng: 'Nigeria', ke: 'Kenya',
  eg: 'Egypt', ma: 'Morocco',
  // Demonyms
  american: 'United States', british: 'United Kingdom', german: 'Germany',
  french: 'France', spanish: 'Spain', italian: 'Italy', dutch: 'Netherlands',
  swiss: 'Switzerland', austrian: 'Austria', australian: 'Australia',
  canadian: 'Canada', brazilian: 'Brazil', mexican: 'Mexico', japanese: 'Japan',
  irish: 'Ireland', swedish: 'Sweden', danish: 'Denmark', norwegian: 'Norway',
  finnish: 'Finland', polish: 'Poland', greek: 'Greece', turkish: 'Turkey',
  russian: 'Russia', indian: 'India', chinese: 'China', korean: 'South Korea',
};

/** Resolve a raw country name string to its canonical form. */
export function resolveCountryName(raw: string): string {
  return COUNTRY_ALIASES[raw.trim().toLowerCase()] || raw.trim();
}

/** Clean HTML entities from content text. Uses Wasm when available. */
export function cleanContentText(raw: string): string {
  if (!raw) return '';
  try {
    return wasmCleanHtmlEntities(raw);
  } catch {
    return cleanContentTextFallback(raw);
  }
}

function cleanContentTextFallback(raw: string): string {
  let text = raw;
  text = text
    .replace(/&#8217;|&#x2019;/g, '\u2019')
    .replace(/&#8216;|&#x2018;/g, '\u2018')
    .replace(/&#8220;|&#x201C;/g, '\u201C')
    .replace(/&#8221;|&#x201D;/g, '\u201D')
    .replace(/&#8230;|&#x2026;/g, '\u2026')
    .replace(/&#8211;|&#x2013;/g, '\u2013')
    .replace(/&#8212;|&#x2014;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)));
  text = text.replace(/\n*The post\s.+appeared first on\s.+\.?\s*$/i, '');
  text = text.replace(/\s*…?\s*Continue reading\s.+[→\u2192]?\s*$/i, '');
  text = text
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
