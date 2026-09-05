/**
 * OSM element tags -> venue columns, for the coordinate-keyed enrichment path.
 *
 * `venue-accessibility-osm` already fetches the element and already proves
 * identity (an OSM id we hold, or a name match inside 60 m, with two same-named
 * candidates blocking). That match is the expensive and risky half, and it was
 * being spent to read ONE tag. The same response carries `opening_hours`,
 * `phone`, `website` and the primary feature tag.
 *
 * Measured on prod 2026-09-04, live venues (26,905):
 *   hours          26,279 empty (97.7%)
 *   phone          18,796 empty (70%)
 *   website        16,908 empty (63%)
 *   category='other' 6,930      (26%)
 *
 * Everything here is PURE and default-reject. A value that cannot be parsed with
 * confidence yields null rather than a guess: a wrong phone number is a dead end
 * and a wrong opening time is a wasted journey across a city.
 */

/** Slot shape consumed by `src/utils/openingHours.ts`. Do not change unilaterally. */
export interface HoursSlot {
  day: number // 1 = Monday … 7 = Sunday
  open: string // "HHMM"
  close: string // "HHMM", or "+HHMM" when the slot runs past midnight
}

export interface VenueHours {
  display: string
  regular: HoursSlot[]
}

const DAY_INDEX: Record<string, number> = {
  mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 7,
}

/**
 * Tokens whose presence means we cannot represent the rule faithfully. The
 * consumer has exactly one axis (day-of-week) and no notion of dates, seasons,
 * holidays, weeks or solar times. Encountering any of these makes the WHOLE
 * value unparseable rather than partially applied — dropping the exception and
 * keeping the rest would publish "open" for a venue that is seasonally closed.
 */
const UNSUPPORTED = [
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i, // month selectors
  /\bweek\b/i,
  /sunrise|sunset|dawn|dusk/i,
  /\[[^\]]*\]/, // Mo[1] — nth weekday of month
  /"/, // free-text comment
  /\d{4}/, // a bare year, e.g. "2026 Jan 01"
  /easter/i,
]

/** "HH:MM" -> minutes since midnight. Accepts 24:00. */
function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59) return null
  if (h === 24 && min !== 0) return null
  return h * 60 + min
}

const pad = (n: number) => String(n).padStart(2, '0')

/** minutes -> "HHMM"; minutes >= 1440 -> "+HHMM" (past midnight). */
function minutesToSlot(mins: number): string {
  const overnight = mins >= 24 * 60
  const m = overnight ? mins - 24 * 60 : mins
  return `${overnight ? '+' : ''}${pad(Math.floor(m / 60))}${pad(m % 60)}`
}

/** Expand "Mo-Th", "Mo,We,Fr", "Mo" into day numbers. Null if anything is off-vocabulary. */
function parseDays(spec: string): number[] | null {
  const days = new Set<number>()
  for (const part of spec.split(',')) {
    const p = part.trim().toLowerCase()
    if (!p) continue
    const range = /^([a-z]{2})-([a-z]{2})$/.exec(p)
    if (range) {
      const a = DAY_INDEX[range[1]]
      const b = DAY_INDEX[range[2]]
      if (!a || !b) return null
      // Wrapping ranges are legal in OSM: Sa-Su, Fr-Mo.
      let d = a
      for (let guard = 0; guard < 7; guard++) {
        days.add(d)
        if (d === b) break
        d = d === 7 ? 1 : d + 1
      }
      continue
    }
    const single = DAY_INDEX[p]
    if (!single) return null
    days.add(single)
  }
  return days.size ? [...days].sort((x, y) => x - y) : null
}

/**
 * Parse an OSM `opening_hours` value into the venue `hours` jsonb shape.
 *
 * Returns null — deliberately, and for the whole value — on anything this
 * cannot represent exactly. Supported: `24/7`, day selectors (`Mo`, `Mo-Fr`,
 * `Mo,We,Fr`, wrapping `Sa-Mo`), multiple `;`-separated rules, multiple
 * `,`-separated time ranges per rule, `off`/`closed` rules, and overnight spans.
 *
 * `open_now` is NEVER produced. It exists in scraper-written rows and
 * `src/utils/openingHours.ts` already documents it as stale (frozen at fetch
 * time); storing a point-in-time boolean is storing a claim that is wrong within
 * the hour.
 */
export function parseOsmOpeningHours(raw: unknown): VenueHours | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  if (UNSUPPORTED.some((re) => re.test(value))) return null

  if (/^24\s*\/\s*7$/.test(value)) {
    return {
      display: value,
      // 0000-2359 matches how the existing corpus encodes all-day ("Open Daily
      // 00:00-23:59"), so open-now behaves identically for scraped and OSM rows.
      regular: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, open: '0000', close: '2359' })),
    }
  }

  const slots: HoursSlot[] = []
  for (const rawRule of value.split(';')) {
    const rule = rawRule.trim()
    if (!rule) continue

    // "Mo-Fr off" / "PH closed" — the days are explicitly shut. Nothing to add.
    // A rule mentioning PH (public holidays) is skipped rather than rejected:
    // "Mo-Fr 09:00-17:00; PH off" is a complete weekly schedule plus a holiday
    // exception we simply cannot express, and refusing it would throw away a
    // correct week.
    const offMatch = /^(.+?)\s+(?:off|closed)$/i.exec(rule)
    if (offMatch) {
      if (!/^ph\b/i.test(offMatch[1].trim()) && parseDays(offMatch[1]) === null) return null
      continue
    }
    if (/^ph\b/i.test(rule)) continue

    const m = /^([A-Za-z,\-\s]+?)\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)$/.exec(rule)
    if (!m) return null

    const days = parseDays(m[1])
    if (!days) return null

    for (const range of m[2].split(',')) {
      const [rawOpen, rawClose] = range.split('-')
      const open = hhmmToMinutes(rawOpen)
      let close = hhmmToMinutes(rawClose)
      if (open === null || close === null) return null
      // 17:00-02:00 runs into the next day. 00:00-24:00 is a full day, already
      // 1440. Equal endpoints are ambiguous (a full day? a zero-length slot?) —
      // reject rather than pick one.
      if (close === open) return null
      if (close < open) close += 24 * 60
      for (const day of days) {
        slots.push({ day, open: minutesToSlot(open), close: minutesToSlot(close) })
      }
    }
  }

  if (!slots.length) return null
  slots.sort((a, b) => a.day - b.day || a.open.localeCompare(b.open))
  // The raw OSM value IS the display string. It is the mapper's own claim and is
  // readable as-is; rewriting it would invent a phrasing nobody wrote.
  return { display: value, regular: slots }
}

/** OSM tag -> `venues.phone`. Returns null for anything that is not a plausible number. */
export function osmPhone(tags: Record<string, string>): string | null {
  const raw = tags['contact:phone'] ?? tags.phone ?? tags['contact:mobile']
  if (typeof raw !== 'string') return null
  // OSM allows several numbers separated by ';' — take the first, which is the
  // primary by convention.
  const first = raw.split(';')[0].trim()
  if (!first) return null
  // Must contain enough digits to be a real number and nothing alphabetic.
  const digits = first.replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 15) return null
  if (/[a-z]/i.test(first)) return null
  return first
}

/** OSM tag -> `venues.website`. http(s) only. */
export function osmWebsite(tags: Record<string, string>): string | null {
  const raw = tags['contact:website'] ?? tags.website
  if (typeof raw !== 'string') return null
  let first = raw.split(';')[0].trim()
  if (!first) return null
  // Bare domains are common in OSM. Upgrade rather than discard, but never
  // invent a scheme other than https.
  if (!/^https?:\/\//i.test(first)) {
    if (!/^[\w.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(first)) return null
    first = `https://${first}`
  }
  try {
    const u = new URL(first)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * OSM primary feature tag -> `venues.category`, restricted to the mundane,
 * unambiguous physical types.
 *
 * DELIBERATELY UNMAPPABLE, and this is the load-bearing part of the file:
 *
 *   sauna            On this platform the value asserts a GAY sauna / bathhouse.
 *                    OSM `leisure=sauna` is a hotel wellness room. Mapping it
 *                    would make a sexual-venue claim about an ordinary business
 *                    — the same class of error as the name-inference pass that
 *                    labelled a hair salon `sauna`.
 *   cruising         Likewise a sexual-venue claim; no OSM tag carries it.
 *   community_center OSM `amenity=community_centre` is any community hall. Here
 *                    it reads as an LGBTQ+ centre.
 *   event-venue      Too broad to infer; overlaps club/theater/other.
 *   outdoor          `leisure=park` is a park, not a queer outdoor spot.
 *
 * The caller applies this ONLY where the stored category is `other`, so a
 * curated value can never be overwritten by a mapper's generic tag.
 */
const CATEGORY_BY_TAG: Record<string, Record<string, string>> = {
  amenity: {
    bar: 'bar',
    pub: 'bar',
    biergarten: 'bar',
    nightclub: 'club',
    cafe: 'cafe',
    restaurant: 'restaurant',
    fast_food: 'restaurant',
    food_court: 'restaurant',
    ice_cream: 'cafe',
    theatre: 'theater',
    cinema: 'theater',
    arts_centre: 'gallery',
    toilets: 'toilet',
  },
  tourism: {
    hotel: 'hotel',
    hostel: 'hotel',
    guest_house: 'hotel',
    motel: 'hotel',
    apartment: 'hotel',
    gallery: 'gallery',
  },
  leisure: {
    fitness_centre: 'gym',
  },
  shop: {
    hairdresser: 'salon',
    beauty: 'salon',
    tattoo: 'salon',
  },
}

export function osmVenueCategory(tags: Record<string, string>): string | null {
  for (const [key, table] of Object.entries(CATEGORY_BY_TAG)) {
    const v = tags[key]
    if (typeof v === 'string' && table[v]) return table[v]
  }
  // Any other `shop=*` is still a shop. Checked last so `shop=hairdresser`
  // resolves to `salon` rather than being swallowed here.
  if (typeof tags.shop === 'string' && tags.shop && tags.shop !== 'no') return 'shop'
  return null
}
