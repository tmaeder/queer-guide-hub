// Shared helpers for the hardened venue pipeline.
// Pure functions — importable from pipeline-normalize, -validate, -deduplicate, -commit.

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
  if (population != null) {
    const p = Number(population)
    if (!Number.isFinite(p) || p < 0) errors.push('E_BAD_POPULATION')
    else if (p > 50_000_000) warnings.push('W_IMPLAUSIBLE_POPULATION')
  }

  return { errors, warnings, quality: Math.max(0, Math.min(100, quality)) }
}

export function validateVenueNormalized(n: Record<string, unknown>): ValidationOutcome {
  const errors: string[] = []
  const warnings: string[] = []
  let quality = 100

  const name = String(n.name ?? '').trim()
  if (name.length < 2) errors.push('E_MISSING_NAME')

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
