// Shared helpers for the hardened venue pipeline.
// Pure functions — importable from pipeline-normalize, -validate, -deduplicate, -commit.

import {
  MAX_CITY_AREA_KM2,
  MAX_COUNTRY_AREA_KM2,
  MAX_DENSITY_PER_KM2,
  MAX_ELEVATION_M,
  MIN_ELEVATION_M,
} from './city-scalar-bounds.ts'

export function normalizePhone(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  const digits = s.replace(/[^0-9+]/g, '')
  if (digits.length < 5) return null
  return digits
}

export function normalizeEmail(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim().toLowerCase()
  if (!s) return null
  return s.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/) ? s : null
}

export function extractDomain(raw: unknown): string | null {
  if (!raw) return null
  try {
    const s = String(raw).trim()
    if (!s) return null
    const withProto = /^https?:\/\//i.test(s) ? s : 'https://' + s
    const u = new URL(withProto)
    return u.hostname.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return null
  }
}

export function normalizeName(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isValidUrl(s: unknown): boolean {
  if (!s) return false
  try {
    const str = String(s)
    new URL(/^https?:\/\//i.test(str) ? str : 'https://' + str)
    return true
  } catch {
    return false
  }
}

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  const a = Number(lat), b = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false
  if (a === 0 && b === 0) return false // null-island
  return true
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface ValidationOutcome {
  errors: string[]
  warnings: string[]
  quality: number
}

/**
 * Physical bounds for the dimensioned scalars.
 *
 * Until 2026-09-08 `area_km2` and `elevation_m` had NO validator branch on any
 * entity, and population was checked only for `isFinite && >= 0`. What got
 * through, measured on prod:
 *
 *   City of Hamilton, Bermuda   area 1,138,110,000 km2  (~7x Earth's land area)
 *   Maui                        elevation 10,023 m      (above Everest)
 *   Norfolk, United States      population 343,000,000  (above the entire US)
 *
 * Each bound sits just outside the real-world extreme so a true value is never
 * flagged, and the extreme is named so a future reader can check it rather than
 * trust it.
 *
 * THESE ARE WARNINGS, NEVER ERRORS, and that is load-bearing. `pipeline-validate`
 * turns any `errors` entry into `ai_validation_status='rejected'`, and per the
 * human-approval trigger a hard rejection is the one state an admin can NEVER
 * override. Failing a scalar bound as an error would therefore discard the entire
 * staged entity — name, coordinates, country link, legal payload — because one
 * number was wrong. A bad number invalidates the number, not the row. This is the
 * same failure class as a single `W_NO_COORDS` stranding a venue for 40 days.
 *
 * NOTE ON REACH. The measured defect did NOT come through this function. All 181
 * bad areas were written by `city-factual-backfill`, which UPDATEs `cities`
 * directly and never calls a validator; `validateCityNormalized` has exactly one
 * caller, `pipeline-validate`, which only ever reads `ingestion_staging`. The
 * plausibility guard on the producer that actually caused the incident lives in
 * `city-factual-backfill/index.ts` (`plausibleCityScalar`). What follows covers
 * the staging path, which had no such check either.
 */
/**
 * NOT VALIDATED HERE, and the two cases are NOT the same — an earlier version of
 * this comment said both live in SQL, which was false for the second one:
 *
 *   - city population vs. its country's population — MOVED TO SQL. Realised as
 *     `population_exceeds_country` in `city_scalar_defects()`, where the country
 *     row is in scope. This function is pure over one staged item and cannot see
 *     it; approximating it from `metadata` would report a bound never checked.
 *   - a staged value regressing against the corpus row it will replace —
 *     **DROPPED, implemented nowhere.** It needs the row being replaced, which
 *     the validator cannot see and SQL cannot either: at gate time the corpus row
 *     IS the staged value's destination, so there is no "before" left to compare
 *     against. Doing it properly means capturing a pre-commit snapshot, which is
 *     a separate build. Do not read the SQL sentinel expecting to find it.
 */
function readNumber(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (c == null) continue
    // `Number('')` and `Number('  ')` are 0, and `Number.isFinite(0)` is true —
    // so an empty-string field would read as a real zero, trip `area <= 0` and
    // REJECT an otherwise-good city. An empty string is a missing value.
    if (typeof c === 'string' && c.trim() === '') continue
    const n = Number(c)
    if (Number.isFinite(n)) return n
  }
  return null
}

// ISO 3166-1 alpha-2 / alpha-3: uppercase letters only.
export function isValidIsoCode(raw: unknown): boolean {
  if (!raw) return false
  const s = String(raw).trim().toUpperCase()
  return /^[A-Z]{2,3}$/.test(s)
}

export function normalizeIsoCode(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim().toUpperCase()
  return /^[A-Z]{2,3}$/.test(s) ? s : null
}

export function validateCountryNormalized(n: Record<string, unknown>): ValidationOutcome {
  const errors: string[] = []
  const warnings: string[] = []
  let quality = 100

  const name = String(n.name ?? '').trim()
  if (name.length < 2) errors.push('E_MISSING_NAME')

  const meta = (n.metadata ?? {}) as Record<string, unknown>
  const code = (n.code ?? meta.code ?? meta.cca2 ?? meta.iso_a2) as unknown
  if (!code) {
    warnings.push('W_NO_ISO_CODE'); quality -= 15
  } else if (!isValidIsoCode(code)) {
    errors.push('E_BAD_ISO_CODE')
  }

  const loc = (n.location ?? {}) as Record<string, unknown>
  const lat = loc.lat ?? (meta.latitude as unknown)
  const lng = loc.lng ?? (meta.longitude as unknown)
  if (lat != null && lng != null && !isValidCoord(lat, lng)) {
    errors.push('E_BAD_COORDS')
  } else if (lat == null || lng == null) {
    warnings.push('W_NO_COORDS'); quality -= 10
  }

  const population = (n.population ?? meta.population) as unknown
  if (population != null) {
    const p = Number(population)
    if (!Number.isFinite(p) || p < 0) errors.push('E_BAD_POPULATION')
  } else {
    warnings.push('W_NO_POPULATION'); quality -= 5
  }

  const countryArea = readNumber(n.area_km2, meta.area_km2, meta.area)
  if (countryArea != null && (countryArea <= 0 || countryArea > MAX_COUNTRY_AREA_KM2)) {
    warnings.push('W_IMPLAUSIBLE_AREA'); quality -= 10
  }

  if (!n.capital && !meta.capital) { warnings.push('W_NO_CAPITAL'); quality -= 5 }
  if (!n.currency && !meta.currency) { warnings.push('W_NO_CURRENCY'); quality -= 5 }

  return { errors, warnings, quality: Math.max(0, Math.min(100, quality)) }
}

export function validateCityNormalized(n: Record<string, unknown>): ValidationOutcome {
  const errors: string[] = []
  const warnings: string[] = []
  let quality = 100

  const name = String(n.name ?? '').trim()
  if (name.length < 2) errors.push('E_MISSING_NAME')
  if (name.length > 150) errors.push('E_NAME_TOO_LONG')

  const loc = (n.location ?? {}) as Record<string, unknown>
  const meta = (n.metadata ?? {}) as Record<string, unknown>

  // Must resolve to a country — accept either code or name for commit to resolve.
  const countryCode = (loc.country_code ?? meta.country_code ?? meta.countryCode ?? meta.cca2) as unknown
  const countryName = (loc.country ?? meta.country) as unknown
  if (!countryCode && !countryName) {
    errors.push('E_MISSING_COUNTRY')
  } else if (countryCode && !isValidIsoCode(countryCode)) {
    warnings.push('W_BAD_COUNTRY_CODE'); quality -= 10
  }

  const lat = loc.lat
  const lng = loc.lng
  if (lat == null || lng == null) {
    warnings.push('W_NO_COORDS'); quality -= 15
  } else if (!isValidCoord(lat, lng)) {
    errors.push('E_BAD_COORDS')
  }

  const population = (n.population ?? meta.population) as unknown
  let pop: number | null = null
  if (population != null) {
    const p = Number(population)
    if (!Number.isFinite(p) || p < 0) errors.push('E_BAD_POPULATION')
    else {
      pop = p
      if (p > 50_000_000) { warnings.push('W_IMPLAUSIBLE_POPULATION'); quality -= 10 }
    }
  }

  const area = readNumber(n.area_km2, meta.area_km2, meta.area)
  const areaImplausible = area != null && (area <= 0 || area > MAX_CITY_AREA_KM2)
  if (areaImplausible) { warnings.push('W_IMPLAUSIBLE_AREA'); quality -= 10 }

  const elevation = readNumber(n.elevation_m, meta.elevation_m, meta.elevation)
  if (elevation != null && (elevation < MIN_ELEVATION_M || elevation > MAX_ELEVATION_M)) {
    warnings.push('W_IMPLAUSIBLE_ELEVATION'); quality -= 10
  }

  // Only meaningful when the area survived its own bound — a density derived from
  // an already-flagged area says nothing extra, and would double-report it.
  if (pop != null && pop > 0 && area != null && area > 0 &&
      !areaImplausible && pop / area > MAX_DENSITY_PER_KM2) {
    warnings.push('W_IMPLAUSIBLE_DENSITY'); quality -= 10
  }

  return { errors, warnings, quality: Math.max(0, Math.min(100, quality)) }
}

export function validateVenueNormalized(n: Record<string, unknown>): ValidationOutcome {
  const errors: string[] = []
  const warnings: string[] = []
  let quality = 100

  const name = String(n.name ?? '').trim()
  if (name.length < 2) errors.push('E_MISSING_NAME')
  // Mojibake = UTF-8 bytes wrongly decoded as Latin-1. Match the common
  // double-encode lead bytes (\u00C3 'Ã', \u00E2\u20AC 'â€', \u00C2 'Â'
  // followed by a Latin-1 supplement byte). Escapes only — no literal
  // irregular whitespace.
  if (/[\u00C3\u00C2][\u0080-\u00BF]|\u00E2\u20AC/.test(name)) { warnings.push('W_MOJIBAKE'); quality -= 5 }

  const loc = (n.location ?? {}) as Record<string, unknown>
  if (!loc.lat || !loc.lng) { warnings.push('W_NO_COORDS'); quality -= 15 }
  else if (!isValidCoord(loc.lat, loc.lng)) { errors.push('E_BAD_COORDS') }

  if (!loc.city)    { warnings.push('W_NO_CITY');    quality -= 10 }
  if (!loc.country) { warnings.push('W_NO_COUNTRY'); quality -= 10 }
  if (!loc.address) { warnings.push('W_NO_ADDRESS'); quality -= 5 }

  const c = (n.contacts ?? {}) as Record<string, unknown>
  const hasContact = c.phone || c.email || c.website
  if (!hasContact) { warnings.push('W_NO_CONTACT'); quality -= 10 }

  if (c.phone && !normalizePhone(c.phone)) { warnings.push('W_INVALID_PHONE'); quality -= 5 }
  if (c.email && !normalizeEmail(c.email)) { warnings.push('W_INVALID_EMAIL'); quality -= 5 }
  if (c.website && !isValidUrl(c.website)) { warnings.push('W_INVALID_URL'); quality -= 5 }

  const desc = String(n.description ?? '').trim()
  if (desc.length < 20) { warnings.push('W_SHORT_DESCRIPTION'); quality -= 5 }

  return { errors, warnings, quality: Math.max(0, Math.min(100, quality)) }
}
