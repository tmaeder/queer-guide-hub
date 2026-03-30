/**
 * Pure event validation rule functions.
 * No DB or Supabase dependencies — only Intl, Date, Math.
 * Used by the event-validator automation module and unit tests.
 */

import {
  computeTitleSimilarity, computeSimilarity, normalizeText,
} from './fuzzy-match.ts'
import {
  computeDedupConfidence, type ConfidenceResult, type ReviewAction,
} from './confidence-scoring.ts'

// ── Types ────────────────────────────────────────────────────────────────────

export interface EventRecord {
  id: string
  title: string
  event_type: string
  start_date: string       // ISO 8601 UTC
  end_date: string | null
  timezone: string | null   // IANA, e.g. "Europe/Berlin"
  venue_id: string | null
  venue_name: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  city: string
  city_id: string | null
  country_id: string | null
  status: string | null
  source?: string | null
}

export interface VenueRecord {
  id: string
  name: string
  address: string
  city: string
  country: string
  latitude: number | null
  longitude: number | null
}

export interface VenueDuplicatePair {
  venueA: VenueRecord
  venueB: VenueRecord
  matchType: 'same_address' | 'similar_name_same_street'
  nameSimilarity: number
  normalizedAddress: string | null
  street: string | null
}

export interface ValidationIssue {
  rule_id: string
  rule_name: string
  severity: 'warning' | 'error'
  action: 'flag' | 'autofix'
  details: Record<string, unknown>
  suggested_changes?: { field: string; old_value: unknown; new_value: unknown }[]
}

export interface DuplicatePair {
  eventA: EventRecord
  eventB: EventRecord
  timeDiffMin: number
  distanceM: number | null
  classification: 'auto_merge' | 'flag_review'
  confidence: ConfidenceResult
  titleSimilarity: number
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

function safeTimezone(tz: string | null): string | undefined {
  if (!tz) return undefined
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return tz
  } catch {
    return undefined
  }
}

export function getLocalHour(isoDate: string, tz: string | null): number {
  const date = new Date(isoDate)
  const safeTz = safeTimezone(tz)
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    ...(safeTz ? { timeZone: safeTz } : {}),
  }).formatToParts(date)
  const hourPart = parts.find(p => p.type === 'hour')
  return parseInt(hourPart?.value ?? '0', 10)
}

export function getLocalMinute(isoDate: string, tz: string | null): number {
  const date = new Date(isoDate)
  const safeTz = safeTimezone(tz)
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    ...(safeTz ? { timeZone: safeTz } : {}),
  }).formatToParts(date)
  const minutePart = parts.find(p => p.type === 'minute')
  return parseInt(minutePart?.value ?? '0', 10)
}

export function getLocalDayOfWeek(isoDate: string, tz: string | null): number {
  const date = new Date(isoDate)
  const safeTz = safeTimezone(tz)
  const dayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    ...(safeTz ? { timeZone: safeTz } : {}),
  }).format(date)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[dayStr] ?? 0
}

export function getLocalDateKey(isoDate: string, tz: string | null): string {
  const date = new Date(isoDate)
  const safeTz = safeTimezone(tz)
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(safeTz ? { timeZone: safeTz } : {}),
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value ?? '0000'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  const d = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

// ── Address normalization ────────────────────────────────────────────────────

const STREET_ABBREVS: Record<string, string> = {
  'st': 'street', 'st.': 'street', 'str': 'strasse', 'str.': 'strasse',
  'ave': 'avenue', 'ave.': 'avenue', 'blvd': 'boulevard', 'blvd.': 'boulevard',
  'rd': 'road', 'rd.': 'road', 'dr': 'drive', 'dr.': 'drive',
  'ln': 'lane', 'ln.': 'lane', 'ct': 'court', 'ct.': 'court',
  'pl': 'place', 'pl.': 'place', 'sq': 'square', 'sq.': 'square',
  'pkwy': 'parkway', 'hwy': 'highway',
}

export function normalizeAddress(address: string | null): string | null {
  if (!address?.trim()) return null
  let norm = address.trim().toLowerCase()
  // Remove punctuation except hyphens in house numbers
  norm = norm.replace(/[.,;:!?'"()]/g, '')
  // Collapse whitespace
  norm = norm.replace(/\s+/g, ' ')
  // Replace abbreviations
  const words = norm.split(' ')
  const expanded = words.map(w => STREET_ABBREVS[w] ?? w)
  return expanded.join(' ')
}

// ── Geo distance ─────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000

export function haversineDistance(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Per-event rule checks ────────────────────────────────────────────────────

export interface TimeWindowConfig {
  event_types: string[]
  min_hour: number
  max_hour: number
}

export function checkTimeWindow(
  event: EventRecord,
  config: TimeWindowConfig,
  ruleId: string,
  ruleName: string,
): ValidationIssue | null {
  if (!config.event_types.includes(event.event_type)) return null

  const hour = getLocalHour(event.start_date, event.timezone)
  const minute = getLocalMinute(event.start_date, event.timezone)
  const timeValue = hour + minute / 60

  // Inclusive: [min_hour, max_hour] — max_hour:00 is OK, max_hour:01 is not
  if (timeValue >= config.min_hour && timeValue <= config.max_hour) return null

  return {
    rule_id: ruleId,
    rule_name: ruleName,
    severity: 'warning',
    action: 'flag',
    details: {
      reason: `${event.event_type} event starts at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} local time, expected ${config.min_hour}:00-${config.max_hour}:00`,
      local_hour: hour,
      local_minute: minute,
      expected_min: config.min_hour,
      expected_max: config.max_hour,
      timezone: event.timezone ?? 'UTC (fallback)',
      timezone_source: event.timezone ? 'event' : 'utc_fallback',
    },
  }
}

export interface DayCheckConfig {
  event_types: string[]
  expected_day: number  // 0=Sun, 6=Sat
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function checkDayOfWeek(
  event: EventRecord,
  config: DayCheckConfig,
  ruleId: string,
  ruleName: string,
): ValidationIssue | null {
  if (!config.event_types.includes(event.event_type)) return null

  const dow = getLocalDayOfWeek(event.start_date, event.timezone)
  if (dow === config.expected_day) return null

  return {
    rule_id: ruleId,
    rule_name: ruleName,
    severity: 'warning',
    action: 'flag',
    details: {
      reason: `${event.event_type} event is on ${DAY_NAMES[dow]}, expected ${DAY_NAMES[config.expected_day]}`,
      local_day: dow,
      local_day_name: DAY_NAMES[dow],
      expected_day: config.expected_day,
      expected_day_name: DAY_NAMES[config.expected_day],
      timezone: event.timezone ?? 'UTC (fallback)',
      timezone_source: event.timezone ? 'event' : 'utc_fallback',
    },
  }
}

export function checkTimeOrder(
  event: EventRecord,
  ruleId: string,
  ruleName: string,
): ValidationIssue | null {
  if (!event.end_date) return null

  const startMs = new Date(event.start_date).getTime()
  const endMs = new Date(event.end_date).getTime()

  if (startMs <= endMs) return null

  return {
    rule_id: ruleId,
    rule_name: ruleName,
    severity: 'error',
    action: 'autofix',
    details: {
      reason: `end_date (${event.end_date}) is before start_date (${event.start_date}) — swapping`,
      original_start: event.start_date,
      original_end: event.end_date,
    },
    suggested_changes: [
      { field: 'start_date', old_value: event.start_date, new_value: event.end_date },
      { field: 'end_date', old_value: event.end_date, new_value: event.start_date },
    ],
  }
}

// ── Duplicate detection ──────────────────────────────────────────────────────

export interface DedupConfig {
  time_tolerance_min: number
  distance_threshold_m: number
}

function locationsMatch(
  a: EventRecord, b: EventRecord, distThresholdM: number,
): { match: boolean; distanceM: number | null } {
  // 1. Same venue_id
  if (a.venue_id && b.venue_id && a.venue_id === b.venue_id) {
    return { match: true, distanceM: 0 }
  }

  // 2. Same normalized address
  const addrA = normalizeAddress(a.address)
  const addrB = normalizeAddress(b.address)
  if (addrA && addrB && addrA === addrB) {
    return { match: true, distanceM: null }
  }

  // 3. Geo distance
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    const dist = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude)
    if (dist <= distThresholdM) {
      return { match: true, distanceM: Math.round(dist) }
    }
    return { match: false, distanceM: Math.round(dist) }
  }

  return { match: false, distanceM: null }
}

export function findTimePlaceDuplicates(
  events: EventRecord[],
  config: DedupConfig,
): DuplicatePair[] {
  const toleranceMs = config.time_tolerance_min * 60_000
  const pairs: DuplicatePair[] = []
  const seen = new Set<string>()

  // Group by local date + city for O(n) grouping
  const groups = new Map<string, EventRecord[]>()
  for (const ev of events) {
    if (ev.status === 'cancelled') continue
    const key = `${getLocalDateKey(ev.start_date, ev.timezone)}:${(ev.city ?? '').toLowerCase()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ev)
  }

  // O(k^2) within each group (k is small per date+city)
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]

        // Stable pair key to avoid duplicates
        const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`
        if (seen.has(pairKey)) continue

        // Check time difference
        const timeDiffMs = Math.abs(
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        )
        if (timeDiffMs > toleranceMs) continue

        // Check location match
        const loc = locationsMatch(a, b, config.distance_threshold_m)
        if (!loc.match) continue

        seen.add(pairKey)
        const { classification, confidence, titleSimilarity } = classifyDuplicatePair(a, b, {
          timeDiffMin: Math.round(timeDiffMs / 60_000),
          distanceM: loc.distanceM,
          locationMatch: loc.match,
        })
        pairs.push({
          eventA: a,
          eventB: b,
          timeDiffMin: Math.round(timeDiffMs / 60_000),
          distanceM: loc.distanceM,
          classification,
          confidence,
          titleSimilarity,
        })
      }
    }
  }

  return pairs
}

/**
 * Classify a duplicate pair using fuzzy title matching and multi-signal confidence.
 *
 * auto_merge: High confidence that these are the same event (title similarity >= 0.85,
 *             same type, confidence >= 0.90)
 * flag_review: Likely duplicate but needs human verification
 */
export function classifyDuplicatePair(
  a: EventRecord,
  b: EventRecord,
  context?: { timeDiffMin: number; distanceM: number | null; locationMatch: boolean },
): { classification: 'auto_merge' | 'flag_review'; confidence: ConfidenceResult; titleSimilarity: number } {
  const titleSim = computeTitleSimilarity(a.title, b.title)
  const typeMatch = normalizeText(a.event_type) === normalizeText(b.event_type)
  const sourceMatch = !!(a.source && b.source && a.source === b.source)

  const confidence = computeDedupConfidence({
    titleSimilarity: titleSim.score,
    locationMatch: context?.locationMatch ?? true,
    geoDistanceM: context?.distanceM ?? null,
    timeDiffMin: context?.timeDiffMin ?? null,
    categoryMatch: typeMatch,
    sourceMatch,
    yearMatch: titleSim.yearMatch,
  })

  // auto_merge requires: high title similarity AND same event type AND high overall confidence
  const classification: 'auto_merge' | 'flag_review' =
    titleSim.score >= 0.85 && typeMatch && confidence.score >= 0.90
      ? 'auto_merge'
      : 'flag_review'

  return { classification, confidence, titleSimilarity: titleSim.score }
}

/** Pick the richer event as primary (more non-null fields, tiebreak by id for stability). */
export function pickPrimary(a: EventRecord, b: EventRecord): { primary: EventRecord; secondary: EventRecord } {
  const MERGE_FIELDS = [
    'description', 'venue_id', 'venue_name', 'address', 'latitude', 'longitude',
    'timezone', 'city_id', 'country_id',
  ] as const

  const countA = MERGE_FIELDS.filter(f => (a as Record<string, unknown>)[f] != null).length
  const countB = MERGE_FIELDS.filter(f => (b as Record<string, unknown>)[f] != null).length

  if (countA > countB) return { primary: a, secondary: b }
  if (countB > countA) return { primary: b, secondary: a }
  // Tiebreak: lower id for determinism
  return a.id < b.id ? { primary: a, secondary: b } : { primary: b, secondary: a }
}

/** Compute merge changes: for each null field in primary, take secondary's value. */
export function computeMergeChanges(
  primary: EventRecord,
  secondary: EventRecord,
): { field: string; old_value: unknown; new_value: unknown }[] {
  const MERGE_FIELDS = [
    'description', 'venue_id', 'venue_name', 'address', 'latitude', 'longitude',
    'timezone', 'city_id', 'country_id', 'end_date',
  ] as const

  const changes: { field: string; old_value: unknown; new_value: unknown }[] = []
  const pObj = primary as Record<string, unknown>
  const sObj = secondary as Record<string, unknown>

  for (const field of MERGE_FIELDS) {
    if (pObj[field] == null && sObj[field] != null) {
      changes.push({ field, old_value: null, new_value: sObj[field] })
    }
  }
  return changes
}

// ── Venue deduplication ────────────────────────────────────────────────────

/** Extract street name from an address (first line, without house number). */
export function extractStreet(address: string | null): string | null {
  if (!address?.trim()) return null
  // Take first line (before comma or newline)
  const firstLine = address.split(/[,\n]/)[0].trim().toLowerCase()
  if (!firstLine) return null
  // Remove house number (leading or trailing digits)
  let street = firstLine
    .replace(/^\d+[\s\-/]*/, '')   // leading: "123 Main St" → "Main St"
    .replace(/\s+\d+[\s\-/]*$/, '') // trailing: "Hauptstr. 15" → "Hauptstr."
    .trim()
  // Normalize abbreviations
  const words = street.split(/\s+/)
  const expanded = words.map(w => STREET_ABBREVS[w] ?? w)
  street = expanded.join(' ')
  // Remove remaining punctuation
  street = street.replace(/[.,;:!?'"()]/g, '').replace(/\s+/g, ' ').trim()
  return street || null
}

/**
 * Find venues with identical normalized addresses (Rule 4).
 * Groups by city to avoid false positives across different cities.
 */
export function findDuplicateAddressVenues(venues: VenueRecord[]): VenueDuplicatePair[] {
  const pairs: VenueDuplicatePair[] = []
  const seen = new Set<string>()

  // Group by city
  const byCity = new Map<string, VenueRecord[]>()
  for (const v of venues) {
    const key = v.city.trim().toLowerCase()
    if (!byCity.has(key)) byCity.set(key, [])
    byCity.get(key)!.push(v)
  }

  for (const group of byCity.values()) {
    // Build address index
    const byAddr = new Map<string, VenueRecord[]>()
    for (const v of group) {
      const norm = normalizeAddress(v.address)
      if (!norm) continue
      if (!byAddr.has(norm)) byAddr.set(norm, [])
      byAddr.get(norm)!.push(v)
    }

    for (const [normAddr, vens] of byAddr) {
      if (vens.length < 2) continue
      for (let i = 0; i < vens.length; i++) {
        for (let j = i + 1; j < vens.length; j++) {
          const pairKey = vens[i].id < vens[j].id
            ? `${vens[i].id}:${vens[j].id}`
            : `${vens[j].id}:${vens[i].id}`
          if (seen.has(pairKey)) continue
          seen.add(pairKey)

          const nameSim = computeSimilarity(vens[i].name, vens[j].name)
          pairs.push({
            venueA: vens[i],
            venueB: vens[j],
            matchType: 'same_address',
            nameSimilarity: nameSim.score,
            normalizedAddress: normAddr,
            street: null,
          })
        }
      }
    }
  }
  return pairs
}

/**
 * Find venues with similar names on the same street (Rule 5).
 * Uses fuzzy matching to catch typos like "Berghain" vs "Berghein".
 */
export function findSimilarNameSameStreetVenues(
  venues: VenueRecord[],
  minSimilarity = 0.75,
): VenueDuplicatePair[] {
  const pairs: VenueDuplicatePair[] = []
  const seen = new Set<string>()

  // Group by city + street
  const byStreet = new Map<string, VenueRecord[]>()
  for (const v of venues) {
    const street = extractStreet(v.address)
    if (!street) continue
    const key = `${v.city.trim().toLowerCase()}::${street}`
    if (!byStreet.has(key)) byStreet.set(key, [])
    byStreet.get(key)!.push(v)
  }

  for (const [streetKey, group] of byStreet) {
    if (group.length < 2) continue
    const street = streetKey.split('::')[1]

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pairKey = group[i].id < group[j].id
          ? `${group[i].id}:${group[j].id}`
          : `${group[j].id}:${group[i].id}`
        if (seen.has(pairKey)) continue

        const nameSim = computeSimilarity(group[i].name, group[j].name)
        if (nameSim.score < minSimilarity) continue

        // Skip if addresses are identical (already caught by rule 4)
        const addrA = normalizeAddress(group[i].address)
        const addrB = normalizeAddress(group[j].address)
        if (addrA && addrB && addrA === addrB) continue

        seen.add(pairKey)
        pairs.push({
          venueA: group[i],
          venueB: group[j],
          matchType: 'similar_name_same_street',
          nameSimilarity: nameSim.score,
          normalizedAddress: null,
          street,
        })
      }
    }
  }
  return pairs
}
