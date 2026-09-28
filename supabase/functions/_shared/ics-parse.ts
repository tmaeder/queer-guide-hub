// ============================================================
// RFC 5545 (iCalendar) reader — the first ICS *parser* in this repo.
//
// `_shared/ical-generator.ts`, `calendar-feed`, `calendar-export` and
// `trip-ical` all WRITE .ics; nothing read one until now. This is the read
// side, kept source-agnostic so the next community calendar is a caller and
// not a second parser.
//
// Scope is deliberately narrow: enough of RFC 5545 to read a public Google
// Calendar export correctly, and nothing more. VTODO, VJOURNAL, VALARM,
// VTIMEZONE bodies, FREQ=WEEKLY/YEARLY and BYSETPOS are not implemented —
// they do not occur in the feeds this repo ingests, and an unimplemented rule
// is REPORTED (`unsupported`) rather than silently dropped, so a feed that
// starts using one shows up as a rising count instead of as missing events.
// ============================================================

/** One VEVENT exactly as it appeared, before recurrence is resolved. */
export interface IcsComponent {
  uid: string
  summary: string
  description?: string
  location?: string
  status?: string
  /** Raw DTSTART value plus the parameters it carried. */
  start: IcsMoment
  end?: IcsMoment
  rrule?: string
  /** Present only on a modified instance of a recurring series. */
  recurrenceId?: string
  exdates: string[]
  sequence: number
}

export interface IcsMoment {
  /** ISO 8601 with an explicit offset, or `YYYY-MM-DD` for an all-day value. */
  iso: string
  /** True for `VALUE=DATE` — a whole day with no clock time. */
  allDay: boolean
  /** IANA zone from `TZID`, when the feed named one. Never inferred. */
  tzid?: string
  /** The untouched ICS value, used as the recurrence key. */
  raw: string
}

/**
 * A single publishable event after recurrence is resolved.
 *
 * `instanceKey` is stable across runs and is what a caller should build its
 * `sourceId` from: the same calendar re-read tomorrow yields the same key for
 * the same occurrence, which is what makes re-ingestion idempotent.
 */
export interface IcsEvent {
  uid: string
  instanceKey: string
  summary: string
  description?: string
  location?: string
  status?: string
  start: IcsMoment
  end?: IcsMoment
  /** How this row was produced — carried into metadata so a reader can audit it. */
  origin: 'single' | 'span' | 'instance' | 'override'
  /** The RRULE this came from, when there was one. */
  rrule?: string
  /** For `span`: how many daily occurrences were collapsed into it. */
  spanDays?: number
}

export interface IcsParseResult {
  events: IcsEvent[]
  /** Rules this parser does not implement, with the UID that carried them. */
  unsupported: { uid: string; rrule: string; reason: string }[]
}

// ------------------------------------------------------------
// Lexing
// ------------------------------------------------------------

/**
 * Undo RFC 5545 §3.1 line folding.
 *
 * A folded line continues with a single space OR a single horizontal tab, and
 * both forms appear in the wild. Handling only the space silently truncates
 * every long DESCRIPTION at the fold, which reads as a working parser
 * producing suspiciously short prose.
 */
export function unfold(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '')
}

/**
 * Undo RFC 5545 §3.3.11 TEXT escaping.
 *
 * A SINGLE LEFT-TO-RIGHT SCAN, not a chain of `.replace()` calls — and no
 * ordering of those calls is correct, which is why this is written the long
 * way. Given `a\\nb` (an escaped backslash followed by a literal n), resolving
 * `\n` first matches the SECOND backslash and yields a newline; resolving `\\`
 * first consumes both backslashes and leaves an `n` that the next pass cannot
 * tell from an escape. Only a scan that consumes the escape and its argument
 * together gets it right.
 */
export function unescapeText(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '\\') {
      out += value[i]
      continue
    }
    const next = value[++i]
    if (next === undefined) { out += '\\'; break }
    if (next === 'n' || next === 'N') out += '\n'
    else if (next === ',' || next === ';' || next === '\\') out += next
    // An unknown escape keeps both characters: the spec does not define it, so
    // inventing a meaning would silently rewrite prose.
    else out += '\\' + next
  }
  return out
}

interface ContentLine {
  name: string
  params: Record<string, string>
  value: string
}

function parseLine(line: string): ContentLine | null {
  // The value may contain colons (every URL does), so split on the FIRST one
  // only — but a colon inside a quoted parameter value is not the separator.
  let inQuote = false
  let sep = -1
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuote = !inQuote
    else if (c === ':' && !inQuote) {
      sep = i
      break
    }
  }
  if (sep === -1) return null
  const head = line.slice(0, sep)
  const value = line.slice(sep + 1)
  const parts = head.split(';')
  const name = parts[0].toUpperCase()
  const params: Record<string, string> = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq === -1) continue
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

// ------------------------------------------------------------
// Time
// ------------------------------------------------------------

/**
 * Offset of an IANA zone at a given instant, in milliseconds.
 *
 * Derived from `Intl` rather than from a table, so DST is whatever the
 * platform's tzdata says rather than whatever was true when this shipped.
 */
function zoneOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') parts[p.type] = p.value
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - utcMs
}

/**
 * Wall-clock time in a named zone -> the UTC instant it denotes.
 *
 * Two passes, and the second one is not defensive decoration: on a DST
 * boundary the offset that applies at the *guessed* instant is not the offset
 * that applies at the *answer*, so a single-pass conversion is wrong by an
 * hour for every event in the changeover hour. Re-reading the offset at the
 * candidate answer and re-solving fixes it.
 */
function wallClockToUtc(
  y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const first = zoneOffsetMs(guess, tz)
  let t = guess - first
  const second = zoneOffsetMs(t, tz)
  if (second !== first) t = guess - second
  return new Date(t)
}

/** ICS `YYYYMMDD[THHMMSS[Z]]` -> an IcsMoment carrying an explicit offset. */
export function parseMoment(value: string, params: Record<string, string>): IcsMoment | null {
  const raw = value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
  if (dateOnly) {
    const [, y, mo, d] = dateOnly
    return { iso: `${y}-${mo}-${d}`, allDay: true, raw }
  }
  const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw)
  if (!stamp) return null
  const [, ys, mos, ds, hs, mis, ss, z] = stamp
  const y = Number(ys), mo = Number(mos), d = Number(ds)
  const h = Number(hs), mi = Number(mis), sec = Number(ss)

  if (z) {
    return { iso: new Date(Date.UTC(y, mo - 1, d, h, mi, sec)).toISOString(), allDay: false, raw }
  }
  const tzid = params.TZID
  if (tzid) {
    try {
      return { iso: wallClockToUtc(y, mo, d, h, mi, sec, tzid).toISOString(), allDay: false, tzid, raw }
    } catch {
      // An unknown TZID is not a licence to guess a zone. Fall through to the
      // floating branch, which says so by refusing rather than by picking one.
    }
  }
  // RFC 5545 "floating" time: no zone, means local-wherever-you-are. This repo
  // requires an explicit offset on every event (`E_START_TIMEZONE_MISSING`),
  // and there is no honest offset to attach, so it is rejected upstream.
  return null
}

// ------------------------------------------------------------
// Recurrence
// ------------------------------------------------------------

interface Rrule {
  freq: string
  interval: number
  count?: number
  until?: string
  byday?: string
}

function parseRrule(value: string): Rrule {
  const out: Record<string, string> = {}
  for (const part of value.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0) out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
  }
  return {
    freq: (out.FREQ ?? '').toUpperCase(),
    interval: Math.max(1, Number(out.INTERVAL ?? 1) || 1),
    count: out.COUNT ? Number(out.COUNT) : undefined,
    until: out.UNTIL,
    byday: out.BYDAY,
  }
}

const DAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Comparable `YYYYMMDD` key for an ICS value, ignoring any time part. */
const dayKey = (raw: string) => raw.slice(0, 8)

/**
 * Generate the UTC day-keys an RRULE produces, starting at `start`.
 *
 * Capped at `LIMIT` occurrences: an RRULE with neither COUNT nor UNTIL is
 * infinite by definition, and a calendar that contains one must not be able to
 * hang the ingest run that reads it.
 */
const LIMIT = 400

function expandDaily(startRaw: string, rule: Rrule): string[] {
  const y = Number(startRaw.slice(0, 4)), mo = Number(startRaw.slice(4, 6)), d = Number(startRaw.slice(6, 8))
  const untilKey = rule.until ? dayKey(rule.until) : undefined
  const out: string[] = []
  const cursor = new Date(Date.UTC(y, mo - 1, d))
  for (let i = 0; i < LIMIT; i++) {
    const key = cursor.toISOString().slice(0, 10).replace(/-/g, '')
    if (untilKey && key > untilKey) break
    out.push(key)
    if (rule.count && out.length >= rule.count) break
    if (!rule.count && !untilKey) break // unbounded: the seed only
    cursor.setUTCDate(cursor.getUTCDate() + rule.interval)
  }
  return out
}

/**
 * Nth weekday of a month, e.g. `2WE` = second Wednesday. Negative n counts back
 * from the end (`-1FR` = last Friday), which Google does emit.
 */
function nthWeekdayOfMonth(year: number, month0: number, n: number, weekday: number): Date | null {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month0, 1))
    const shift = (weekday - first.getUTCDay() + 7) % 7
    const day = 1 + shift + (n - 1) * 7
    const probe = new Date(Date.UTC(year, month0, day))
    return probe.getUTCMonth() === month0 ? probe : null
  }
  const last = new Date(Date.UTC(year, month0 + 1, 0))
  const shift = (last.getUTCDay() - weekday + 7) % 7
  const day = last.getUTCDate() - shift + (n + 1) * 7
  const probe = new Date(Date.UTC(year, month0, day))
  return day >= 1 && probe.getUTCMonth() === month0 ? probe : null
}

function expandMonthly(startRaw: string, rule: Rrule): string[] {
  const y = Number(startRaw.slice(0, 4)), mo = Number(startRaw.slice(4, 6)), d = Number(startRaw.slice(6, 8))
  const untilKey = rule.until ? dayKey(rule.until) : undefined
  const byday = rule.byday ? /^(-?\d)?([A-Z]{2})$/.exec(rule.byday.split(',')[0].toUpperCase()) : null
  const n = byday?.[1] ? Number(byday[1]) : null
  const weekday = byday ? DAY_INDEX[byday[2]] : null

  const out: string[] = []
  for (let i = 0; i < LIMIT; i++) {
    const month0 = mo - 1 + i * rule.interval
    const year = y + Math.floor(month0 / 12)
    const m = ((month0 % 12) + 12) % 12
    let probe: Date | null
    if (n != null && weekday != null) {
      probe = nthWeekdayOfMonth(year, m, n, weekday)
    } else {
      // No BYDAY: same day-of-month, skipping months that are too short rather
      // than rolling into the next one (a 31st does not mean the 1st).
      const candidate = new Date(Date.UTC(year, m, d))
      probe = candidate.getUTCMonth() === m ? candidate : null
    }
    if (probe) {
      const key = probe.toISOString().slice(0, 10).replace(/-/g, '')
      if (untilKey && key > untilKey) break
      if (key >= dayKey(startRaw)) out.push(key)
      if (rule.count && out.length >= rule.count) break
    }
    if (!rule.count && !untilKey) break
  }
  return out
}

// ------------------------------------------------------------
// Parse
// ------------------------------------------------------------

/** Read every VEVENT out of an ICS document, recurrence UNresolved. */
export function parseComponents(text: string): IcsComponent[] {
  const lines = unfold(text).split('\n')
  const out: IcsComponent[] = []
  let cur: Partial<IcsComponent> & { exdates: string[] } | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = { exdates: [], sequence: 0 }
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur?.uid && cur.summary && cur.start) out.push(cur as IcsComponent)
      cur = null
      continue
    }
    if (!cur) continue
    const cl = parseLine(line)
    if (!cl) continue
    switch (cl.name) {
      case 'UID': cur.uid = cl.value.trim(); break
      case 'SUMMARY': cur.summary = unescapeText(cl.value).trim(); break
      case 'DESCRIPTION': cur.description = unescapeText(cl.value); break
      case 'LOCATION': cur.location = unescapeText(cl.value).trim(); break
      case 'STATUS': cur.status = cl.value.trim().toUpperCase(); break
      case 'SEQUENCE': cur.sequence = Number(cl.value) || 0; break
      case 'RRULE': cur.rrule = cl.value.trim(); break
      case 'RECURRENCE-ID': cur.recurrenceId = cl.value.trim(); break
      case 'EXDATE':
        for (const v of cl.value.split(',')) cur.exdates.push(v.trim())
        break
      case 'DTSTART': {
        const m = parseMoment(cl.value, cl.params)
        if (m) cur.start = m
        break
      }
      case 'DTEND': {
        const m = parseMoment(cl.value, cl.params)
        if (m) cur.end = m
        break
      }
    }
  }
  return out
}

/** Shift an all-day or timed moment forward by whole days, preserving shape. */
function shiftDays(m: IcsMoment, days: number): IcsMoment {
  if (days === 0) return m
  const base = m.allDay ? new Date(`${m.iso}T00:00:00Z`) : new Date(m.iso)
  base.setUTCDate(base.getUTCDate() + days)
  return m.allDay
    ? { ...m, iso: base.toISOString().slice(0, 10), raw: base.toISOString().slice(0, 10).replace(/-/g, '') }
    : { ...m, iso: base.toISOString() }
}

/** Whole days between two ICS day-keys. */
function daysBetween(aKey: string, bKey: string): number {
  const toMs = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8))
  return Math.round((toMs(bKey) - toMs(aKey)) / 86_400_000)
}

/**
 * Convert an all-day DTEND from the spec's EXCLUSIVE boundary to the INCLUSIVE
 * last day, which is what this repo's `events.end_date` holds.
 *
 * RFC 5545 §3.6.1 makes a `VALUE=DATE` DTEND exclusive: a one-day event on the
 * 27th is written `DTSTART:20261127 DTEND:20261128`. Passing that through
 * unchanged makes every multi-day festival read a day longer than it is —
 * Folsom Europe 2026 (9–13 September) would publish as ending on the 14th.
 *
 * The corpus settles which convention to write. Two independent sources store
 * the inclusive last day: patroc has `Maspalomas Fetish Pride 2026` ending
 * 2026-10-12 against a twelve-day run from 10-01, and `Folsom Europe Berlin
 * 2025` ends 2025-08-31 23:59 for a festival whose last day is the 31st.
 * Matching them is also what lets dedup recognise our row and theirs as the
 * same festival rather than two that differ by a day.
 *
 * Timed values are untouched: a clock end is already the real finish.
 */
export function endInclusive(start: IcsMoment, end: IcsMoment | undefined): IcsMoment | undefined {
  if (!end || !end.allDay) return end
  const shifted = shiftDays(end, -1)
  // A zero-length all-day DTEND (same day as DTSTART, which some producers
  // emit instead of the spec's next-day form) must not reverse the range.
  return shifted.iso < start.iso ? start : shifted
}

/**
 * Resolve a whole calendar into publishable events.
 *
 * THE LOAD-BEARING RULE IS THAT `FREQ=DAILY` IS A SPAN, NOT A RECURRENCE.
 *
 * A human writing a multi-day festival into Google Calendar overwhelmingly
 * reaches for a daily repeat rather than a single event with a later end date.
 * Measured over the rheinfetisch feed, ALL 30 daily rules are exactly that —
 * Darklands across six days, Folsom Europe across five, Maspalomas Fetish Pride
 * across twelve — and expanding them literally would mint roughly 130 rows each
 * titled for the whole festival but dated to one of its days. So a daily rule
 * collapses to ONE event spanning first start to last end, which is also the
 * shape `events.start_date`/`end_date` already models.
 *
 * `FREQ=MONTHLY` is the genuine article and DOES expand: a monthly social is a
 * different night out each time, not one long event.
 *
 * Anything else is reported through `unsupported` and its seed occurrence is
 * still emitted, because dropping the event entirely would lose a real date
 * while reporting nothing a reader could act on.
 */
export function resolveEvents(components: IcsComponent[]): IcsParseResult {
  const events: IcsEvent[] = []
  const unsupported: IcsParseResult['unsupported'] = []

  const byUid = new Map<string, IcsComponent[]>()
  for (const c of components) {
    const list = byUid.get(c.uid) ?? []
    list.push(c)
    byUid.set(c.uid, list)
  }

  for (const [uid, group] of byUid) {
    const master = group.find((c) => !c.recurrenceId)
    const overrides = new Map<string, IcsComponent>()
    for (const c of group) if (c.recurrenceId) overrides.set(dayKey(c.recurrenceId), c)

    // An override whose master is absent from the exported window is still a
    // real event on a real date. Emitting it standalone keeps it; requiring a
    // master would silently discard it.
    if (!master) {
      for (const c of overrides.values()) {
        events.push({
          uid, instanceKey: `${uid}::${dayKey(c.recurrenceId!)}`,
          summary: c.summary, description: c.description, location: c.location, status: c.status,
          start: c.start, end: endInclusive(c.start, c.end), origin: 'override',
        })
      }
      continue
    }

    if (!master.rrule) {
      events.push({
        uid, instanceKey: uid,
        summary: master.summary, description: master.description, location: master.location,
        status: master.status, start: master.start,
        end: endInclusive(master.start, master.end), origin: 'single',
      })
      continue
    }

    const rule = parseRrule(master.rrule)
    const excluded = new Set(master.exdates.map(dayKey))

    let keys: string[]
    if (rule.freq === 'DAILY') keys = expandDaily(master.start.raw, rule)
    else if (rule.freq === 'MONTHLY') keys = expandMonthly(master.start.raw, rule)
    else {
      unsupported.push({ uid, rrule: master.rrule, reason: `FREQ=${rule.freq || 'MISSING'} not implemented` })
      keys = [dayKey(master.start.raw)]
    }

    // Resolve each occurrence to its effective start/end, applying the
    // override that replaces it and dropping the ones EXDATE cancelled.
    const resolved = keys
      .filter((k) => !excluded.has(k))
      .map((k) => {
        const ov = overrides.get(k)
        if (ov) return { key: k, start: ov.start, end: ov.end, from: ov, overridden: true }
        const shift = daysBetween(dayKey(master.start.raw), k)
        return {
          key: k,
          start: shiftDays(master.start, shift),
          end: master.end ? shiftDays(master.end, shift) : undefined,
          from: master,
          overridden: false,
        }
      })
      .filter((r) => r.from.status !== 'CANCELLED')

    if (resolved.length === 0) continue

    if (rule.freq === 'DAILY') {
      // One row spanning the whole festival. Title and prose come from the
      // master; the boundaries come from the first and last surviving
      // occurrence, so an EXDATE or a moved edge shortens the span honestly.
      const first = resolved[0]
      const last = resolved[resolved.length - 1]
      events.push({
        uid, instanceKey: uid,
        summary: master.summary, description: master.description, location: master.location,
        status: master.status,
        start: first.start,
        end: endInclusive(first.start, last.end ?? last.start),
        origin: resolved.length > 1 ? 'span' : 'single',
        rrule: master.rrule,
        spanDays: resolved.length,
      })
      continue
    }

    for (const r of resolved) {
      events.push({
        uid, instanceKey: `${uid}::${r.key}`,
        summary: r.from.summary, description: r.from.description, location: r.from.location,
        status: r.from.status, start: r.start, end: endInclusive(r.start, r.end),
        origin: r.overridden ? 'override' : 'instance',
        rrule: master.rrule,
      })
    }
  }

  events.sort((a, b) => a.start.iso.localeCompare(b.start.iso))
  return { events, unsupported }
}

export function parseIcs(text: string): IcsParseResult {
  return resolveEvents(parseComponents(text))
}

// ------------------------------------------------------------
// Field extraction
// ------------------------------------------------------------

/** Country names as calendars spell them, mapped to ISO-3166-1 alpha-2. */
const COUNTRY_NAMES: Record<string, string> = {
  deutschland: 'DE', germany: 'DE',
  österreich: 'AT', oesterreich: 'AT', austria: 'AT',
  schweiz: 'CH', switzerland: 'CH', suisse: 'CH',
  belgien: 'BE', belgië: 'BE', belgique: 'BE', belgium: 'BE',
  niederlande: 'NL', nederland: 'NL', netherlands: 'NL',
  frankreich: 'FR', france: 'FR',
  spanien: 'ES', españa: 'ES', espana: 'ES', spain: 'ES',
  italien: 'IT', italia: 'IT', italy: 'IT',
  'vereinigtes königreich': 'GB', 'united kingdom': 'GB',
  dänemark: 'DK', denmark: 'DK',
  polen: 'PL', poland: 'PL',
  tschechien: 'CZ', czechia: 'CZ',
  luxemburg: 'LU', luxembourg: 'LU',
}

export interface ParsedLocation {
  venueName?: string
  address?: string
  postalCode?: string
  city?: string
  countryCode?: string
}

/**
 * Split a Google Calendar LOCATION string into its parts.
 *
 * The format is a comma-joined postal address, most often
 * `Venue, Street Nr, PLZ City, Country` — but it degrades all the way down to a
 * bare `Köln, Deutschland` or a single unstructured `Köln Grüngürtel`, and each
 * shorter form has to stay honest rather than being padded out with guesses.
 *
 * ONE GUARD IS LOAD-BEARING: a leftover segment equal to the city is NOT a
 * venue name. `Bremen, 28 Bremen, Deutschland` would otherwise publish a venue
 * literally named "Bremen", which is the place-name collision that
 * `link_event_venues` already documents as a 23% error rate on its name-match
 * branch — 15 of 65 matches there were a city or district masquerading as a
 * venue. Producing that shape at ingest feeds the exact defect downstream.
 */
export function parseLocation(raw: string | undefined): ParsedLocation {
  if (!raw?.trim()) return {}
  const segments = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return {}

  const out: ParsedLocation = {}
  const rest = [...segments]

  const maybeCountry = COUNTRY_NAMES[rest[rest.length - 1].toLowerCase()]
  if (maybeCountry && rest.length > 1) {
    out.countryCode = maybeCountry
    rest.pop()
  }

  // With a country recognised, a lone remaining segment is the CITY. Google
  // does not emit `Venue, Country` with the city missing, and reading `Köln,
  // Deutschland` as a venue named Köln is the same place-name collision the
  // guard further down exists to prevent.
  if (out.countryCode && rest.length === 1) {
    out.city = rest[0]
    return out
  }

  // `…, 35100 Maspalomas, Las Palmas, Spanien` — Spain and Italy put the
  // PROVINCE between the town and the country, and Google emits it. Taken at
  // face value the province becomes the city: the one instance in this feed put
  // a Maspalomas event in Las Palmas, a real city 50 km away, which is exactly
  // the wrong-place class the rest of this function guards against.
  //
  // The postcode is what disambiguates it. A trailing segment with no postcode,
  // sitting directly behind one that HAS a postcode, is an administrative layer
  // above the town rather than the town itself, so it is dropped. Where the
  // trailing segment carries the postcode (the German shape, `50676 Köln`) or
  // nothing does, this leaves the input untouched.
  const POSTAL_CITY = /^(\d{2,6})\s+(.{2,})$/
  if (
    rest.length >= 2 &&
    !POSTAL_CITY.test(rest[rest.length - 1]) &&
    POSTAL_CITY.test(rest[rest.length - 2])
  ) {
    rest.pop()
  }

  // `50676 Köln` / `2000 Antwerpen` / the partial `28 Bremen` Google sometimes
  // emits. Two digits is enough to recognise the shape; the value is kept only
  // when it is a plausible full postcode.
  const tail = rest[rest.length - 1]
  const postal = tail ? POSTAL_CITY.exec(tail) : null
  if (postal) {
    if (postal[1].length >= 4) out.postalCode = postal[1]
    out.city = postal[2].trim()
    rest.pop()
  } else if (rest.length > 1) {
    out.city = tail
    rest.pop()
  }

  if (rest.length === 0) return out

  // A single leftover that repeats the city is the city again, not a venue.
  if (rest.length === 1) {
    const only = rest[0]
    if (out.city && only.toLowerCase() === out.city.toLowerCase()) return out
    out.venueName = only
    return out
  }

  out.venueName = rest[0]
  out.address = rest.slice(1).join(', ')
  return out
}

/** First http(s) link in a DESCRIPTION, from an href or bare text. */
export function firstUrl(description: string | undefined): string | undefined {
  if (!description) return undefined
  const href = /href=["']([^"']+)["']/i.exec(description)
  const candidate = href?.[1] ?? /(https?:\/\/[^\s"'<>]+)/i.exec(description)?.[1]
  if (!candidate) return undefined
  try {
    const u = new URL(candidate)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

/**
 * Decode HTML entities in ONE left-to-right pass.
 *
 * Chained `.replace()` calls double-unescape, and no ordering fixes it — the
 * same trap as `unescapeText` above, one layer up. Resolving `&amp;` before
 * `&lt;` turns the input `&amp;lt;` into `&lt;` and then into `<`, so an author
 * who wrote a LITERAL `&lt;` gets a real angle bracket, and a crafted
 * `&amp;lt;script&amp;gt;` reconstitutes a tag after the tag stripper has
 * already run. A single pass consumes each entity and never re-reads what it
 * produced, so `&amp;lt;` decodes to the literal text `&lt;` and stops there.
 *
 * An unrecognised entity is left EXACTLY as written rather than guessed at:
 * this is prose extraction, and inventing a character silently rewrites it.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    const b = body.toLowerCase()
    try {
      if (b.startsWith('#x')) {
        const code = Number.parseInt(b.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
      if (b.startsWith('#')) {
        const code = Number.parseInt(b.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
    } catch {
      // Outside the Unicode range — keep the source text rather than throw.
      return match
    }
    return Object.hasOwn(NAMED_ENTITIES, b) ? NAMED_ENTITIES[b] : match
  })
}

/** Iteration cap for the tag strip. Far above any real nesting; see stripTags. */
const STRIP_PASSES = 8

/**
 * Remove HTML tags, repeating until the result stops changing.
 *
 * A SINGLE pass is incomplete sanitization: `<<script>script>` contains
 * `<script>` as an inner substring, so removing that one match splices the
 * surrounding `<` and `script>` together and YIELDS a `<script>` the pass has
 * already moved past. Repeating to a fixed point is what closes it.
 *
 * Bounded rather than `while (true)`: this runs on third-party calendar text,
 * and an adversarial input must not be able to spin the ingest run. Eight
 * passes strip eight levels of that nesting, against a real corpus whose
 * deepest markup is an `<a>` inside a `<b>`.
 */
export function stripTags(html: string): string {
  let out = html
  for (let i = 0; i < STRIP_PASSES; i++) {
    const next = out.replace(/<[^>]*>/g, '')
    if (next === out) return out
    out = next
  }
  // Still changing at the cap: drop every remaining angle bracket rather than
  // return markup that outlived the loop.
  return out.replace(/[<>]/g, '')
}

/**
 * Google Calendar descriptions are HTML fragments. Convert to readable plain
 * text, keeping the line structure that `<br>` and block tags carry — the
 * detail page splits prose into paragraphs on blank lines, so flattening
 * everything to one run would publish a wall of text.
 *
 * ORDER IS LOAD-BEARING: tags are stripped BEFORE entities are decoded. The
 * other way round, a decoded `&lt;` becomes a real `<` that the stripper then
 * reads as markup — so text an author deliberately escaped would be deleted,
 * and a crafted payload could be promoted into a tag after sanitization.
 */
export function htmlToText(html: string | undefined): string | undefined {
  if (!html) return undefined
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
  const text = decodeEntities(stripTags(withBreaks))
    // Escaped, not literal: a raw NBSP here is invisible in review and trips
    // no-irregular-whitespace. Google's descriptions are full of them.
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || undefined
}
