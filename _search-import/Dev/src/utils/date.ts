/**
 * Date parsing and timezone-inference utilities.
 */

/** Attempt to parse a free-form date string. Returns null on failure. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null

  // Standard ISO or JS-parseable
  const d = new Date(value)
  if (!isNaN(d.getTime())) return d

  // DD/MM/YYYY
  const dmy = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) {
    const [, day, month, year] = dmy
    const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
    const d2 = new Date(iso)
    if (!isNaN(d2.getTime())) return d2
  }

  // "15 June 2024" / "June 15, 2024"
  const humanDate = value.match(
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i
  )
  if (humanDate) {
    const d3 = new Date(`${humanDate[2]} ${humanDate[1]}, ${humanDate[3]}`)
    if (!isNaN(d3.getTime())) return d3
  }

  return null
}

/** Parse a datetime string with an optional timezone hint. */
export function parseDatetime(
  value: string | null | undefined,
  tzHint?: string | null
): Date | null {
  if (!value) return null

  // If already has timezone offset, parse directly
  if (/[+-]\d{2}:\d{2}$|Z$/.test(value)) {
    return parseDate(value)
  }

  const d = parseDate(value)
  if (!d) return null

  // Adjust for timezone if provided (best-effort; proper TZ support needs a library)
  if (tzHint) {
    try {
      const formatted = d.toLocaleString('en-US', { timeZone: tzHint })
      const adjusted = new Date(formatted)
      if (!isNaN(adjusted.getTime())) return adjusted
    } catch {
      // Ignore unknown timezone
    }
  }

  return d
}

/** Infer IANA timezone from country (best-effort fallback). */
export function inferTimezone(country: string | null | undefined): string {
  if (!country) return 'UTC'

  const map: Record<string, string> = {
    'united kingdom': 'Europe/London',
    uk: 'Europe/London',
    germany: 'Europe/Berlin',
    france: 'Europe/Paris',
    spain: 'Europe/Madrid',
    italy: 'Europe/Rome',
    netherlands: 'Europe/Amsterdam',
    belgium: 'Europe/Brussels',
    portugal: 'Europe/Lisbon',
    'united states': 'America/New_York',
    usa: 'America/New_York',
    canada: 'America/Toronto',
    australia: 'Australia/Sydney',
    brazil: 'America/Sao_Paulo',
    argentina: 'America/Argentina/Buenos_Aires',
    mexico: 'America/Mexico_City',
    japan: 'Asia/Tokyo',
    'south africa': 'Africa/Johannesburg',
    'new zealand': 'Pacific/Auckland',
    ireland: 'Europe/Dublin',
    sweden: 'Europe/Stockholm',
    norway: 'Europe/Oslo',
    denmark: 'Europe/Copenhagen',
    finland: 'Europe/Helsinki',
    switzerland: 'Europe/Zurich',
    austria: 'Europe/Vienna',
    poland: 'Europe/Warsaw',
    'czech republic': 'Europe/Prague',
    czechia: 'Europe/Prague',
  }

  return map[country.toLowerCase().trim()] ?? 'UTC'
}

/** Parse a duration string like "24h", "7d", "30m" into milliseconds. */
export function parseDuration(s: string): number | null {
  const m = s.match(/^(\d+)(h|d|m|w)$/)
  if (!m) return null
  const n = parseInt(m[1]!, 10)
  const unit = m[2]!
  const factors: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  }
  return n * (factors[unit] ?? 0)
}
