/**
 * Canonical Aviasales Affiliate URL Builder
 *
 * Generates deep links to Aviasales flight search using the **params query format**:
 *   https://www.aviasales.com/?params={ORIGIN}{DDMM}{DESTINATION}{DDMM_RETURN}{ADULTS}&marker={MARKER}
 *
 * Examples:
 *   One-way:    https://www.aviasales.com/?params=ZRH0905BCN1&marker=452012
 *   Round-trip:  https://www.aviasales.com/?params=ZRH0905BCN15051&marker=452012  (ZRH→BCN May 9, return May 15)
 *   No dates:   https://www.aviasales.com/?params=ZRHBCN1&marker=452012
 *
 * ⚠️  Do NOT use path-based format (`/ZRH0905BCN1`) — Aviasales returns 404 for path segments.
 * ⚠️  Do NOT use `search.aviasales.com/flights/?origin_iata=...` — that redirects to aviasales.ru (Russian).
 *
 * @module aviasalesUrl
 */

/** Travelpayouts affiliate marker (partner ID) */
export const AFFILIATE_MARKER = '452012';

/** Valid 3-letter IATA code pattern */
const IATA_PATTERN = /^[A-Z]{3}$/;

export interface AviasalesUrlParams {
  /** Origin IATA code (e.g. "ZRH") */
  origin: string;
  /** Destination IATA code (e.g. "BCN") */
  destination: string;
  /** Departure date as ISO string (YYYY-MM-DD or with time) — optional */
  departDate?: string | null;
  /** Return date as ISO string (YYYY-MM-DD or with time) — optional */
  returnDate?: string | null;
  /** Number of adult passengers (default: 1, max: 9) */
  adults?: number;
  /** Override marker for testing */
  marker?: string;
}

export interface UrlValidationResult {
  valid: boolean;
  url: string | null;
  error: string | null;
}

/**
 * Validates an IATA airport code.
 * Must be exactly 3 uppercase letters.
 */
export function isValidIata(code: string | null | undefined): boolean {
  if (!code) return false;
  return IATA_PATTERN.test(code.toUpperCase().trim());
}

/**
 * Extracts DDMM from a date string.
 * Accepts: "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss", ISO 8601, etc.
 * Returns null for invalid/unparseable dates.
 */
export function extractDDMM(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  // Extract YYYY-MM-DD portion
  const iso = dateStr.split('T')[0];
  const parts = iso.split('-');
  if (parts.length !== 3) return null;

  const [yearStr, monthStr, dayStr] = parts;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${dayStr.padStart(2, '0')}${monthStr.padStart(2, '0')}`;
}

/**
 * Checks if a date string represents a date in the past (before today).
 */
export function isDateInPast(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const iso = dateStr.split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  return iso < today;
}

/**
 * Checks if returnDate is before departDate.
 */
export function isReturnBeforeDepart(
  departDate: string | null | undefined,
  returnDate: string | null | undefined
): boolean {
  if (!departDate || !returnDate) return false;
  const depart = departDate.split('T')[0];
  const ret = returnDate.split('T')[0];
  return ret < depart;
}

/**
 * Builds a validated Aviasales affiliate URL.
 *
 * Returns { valid: true, url, error: null } on success.
 * Returns { valid: false, url: null, error: "reason" } on failure.
 *
 * Edge cases handled:
 * - Invalid IATA codes → error
 * - Same origin and destination → error
 * - Past departure date → strips date (opens dateless search)
 * - Return before departure → strips return date
 * - Missing dates → builds URL without date segment
 * - Adults clamped to 1–9
 */
export function buildAviasalesUrl(params: AviasalesUrlParams): UrlValidationResult {
  const {
    origin: rawOrigin,
    destination: rawDest,
    departDate,
    returnDate,
    adults = 1,
    marker = AFFILIATE_MARKER,
  } = params;

  const origin = rawOrigin?.toUpperCase().trim() || '';
  const destination = rawDest?.toUpperCase().trim() || '';

  // Validate IATA codes
  if (!isValidIata(origin)) {
    return { valid: false, url: null, error: `Invalid origin IATA code: "${rawOrigin}"` };
  }
  if (!isValidIata(destination)) {
    return { valid: false, url: null, error: `Invalid destination IATA code: "${rawDest}"` };
  }
  if (origin === destination) {
    return { valid: false, url: null, error: `Origin and destination are the same: "${origin}"` };
  }

  // Clamp adults
  const safeAdults = Math.max(1, Math.min(9, Math.round(adults)));

  // Build search segment: {ORIGIN}{DDMM_DEPART}{DEST}{DDMM_RETURN}{ADULTS}
  let search = origin;

  // Add departure date if valid and not in the past
  let effectiveDepartDate = departDate;
  if (effectiveDepartDate && isDateInPast(effectiveDepartDate)) {
    effectiveDepartDate = null; // Drop past dates silently
  }

  const departDDMM = extractDDMM(effectiveDepartDate);
  if (departDDMM) {
    search += departDDMM;
  }

  search += destination;

  // Add return date if valid and not before departure
  let effectiveReturnDate = returnDate;
  if (effectiveReturnDate && effectiveDepartDate && isReturnBeforeDepart(effectiveDepartDate, effectiveReturnDate)) {
    effectiveReturnDate = null; // Drop invalid return
  }
  if (effectiveReturnDate && isDateInPast(effectiveReturnDate)) {
    effectiveReturnDate = null;
  }

  const returnDDMM = extractDDMM(effectiveReturnDate);
  if (returnDDMM) {
    search += returnDDMM;
  }

  // Add passenger count
  search += String(safeAdults);

  return {
    valid: true,
    url: `https://www.aviasales.com/?params=${search}&marker=${marker}`,
    error: null,
  };
}

/**
 * Convenience wrapper that returns the URL string or a fallback.
 * Used by edge functions and frontend components.
 * Falls back to generic Aviasales search on validation failure.
 */
export function getAffiliateUrl(params: AviasalesUrlParams): string {
  const result = buildAviasalesUrl(params);
  if (result.valid && result.url) {
    return result.url;
  }
  // Fallback: open Aviasales homepage with marker
  console.warn('[aviasalesUrl] Validation failed, using fallback:', result.error);
  return `https://www.aviasales.com/?marker=${params.marker || AFFILIATE_MARKER}`;
}
