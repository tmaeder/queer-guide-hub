// ============================================================
// Pure parsing for source-gayout.
//
// Split out of index.ts so it can be exercised by `deno test` without booting
// the `Deno.serve` handler. Every function here is total and side-effect free:
// given the same HTML it returns the same record, and an input it cannot read
// yields null or an empty list rather than a guess.
// ============================================================

export interface GayoutEvent {
  url: string
  path: string
  name: string
  description?: string
  start?: string
  end?: string
  city?: string
  country?: string
  venueName?: string
  images: string[]
  organizerName?: string
  organizerUrl?: string
  ticketUrl?: string
  sourceTypes: string[]
  eventType: string
  status?: string
}

/** gayout's `?type=` filter values -> `events_event_type_check` vocabulary.
 *
 *  Order is PRECEDENCE, most specific first, because the buckets OVERLAP —
 *  Maspalomas Fetish Pride sits in both `pride` and `leather`.
 *
 *  `bear` maps to `other` deliberately. Our 22-value vocabulary has no bear
 *  entry, and a bear week is not reliably a `festival`, a `party` or a `pride`.
 *  Because `bear` is last it only decides an event the source put in NO other
 *  bucket, and under-reaching is the correct error. The raw buckets are kept on
 *  `metadata.gayout_types`, so a later pass can reclassify without a refetch. */
export const TYPE_PRECEDENCE: ReadonlyArray<readonly [string, string]> = [
  ['leather', 'fetish'],
  ['party', 'party'],
  ['pride', 'pride'],
  ['festival', 'festival'],
  ['bear', 'other'],
]

const LD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

export function ldBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const m of html.matchAll(LD_RE)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1].trim())
    } catch {
      continue // a malformed block is skipped, never guessed at
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      if (item && typeof item === 'object') out.push(item as Record<string, unknown>)
    }
  }
  return out
}

export const typesOf = (node: Record<string, unknown>): string[] => {
  const t = node['@type']
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string')
}

const EVENT_TYPES = new Set([
  'Event',
  'Festival',
  'SocialEvent',
  'MusicEvent',
  'TheaterEvent',
  'ScreeningEvent',
  'ExhibitionEvent',
  'SportsEvent',
  'BusinessEvent',
  'ComedyEvent',
  'DanceEvent',
])

/** Pull the work list out of the listing's `ItemList` JSON-LD.
 *
 *  Deterministic and markup-independent: the listing renders 725 ListItems for
 *  721 unique urls (4 events are listed twice), so HTML cards are never parsed
 *  and a template change cannot silently truncate the queue. */
export function parseWorkList(html: string): { url: string; name: string }[] {
  for (const node of ldBlocks(html)) {
    if (!typesOf(node).includes('ItemList')) continue
    const els = node.itemListElement
    if (!Array.isArray(els)) continue
    const seen = new Set<string>()
    const out: { url: string; name: string }[] = []
    for (const el of els) {
      const rec = el as Record<string, unknown>
      const url = typeof rec?.url === 'string' ? rec.url : ''
      if (!url.includes('/mega-events/') || seen.has(url)) continue
      seen.add(url)
      out.push({ url, name: String(rec.name ?? '') })
    }
    return out
  }
  return []
}

const str = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length ? t : undefined
}

/**
 * A date-only value is kept as-is; a value carrying a time but NO timezone is
 * reduced to its date.
 *
 * `validateEventSourceContract` rejects a naive local timestamp
 * (`E_START_TIMEZONE_MISSING`) and it is right to: this source states a day,
 * not an instant, so stamping `Z` onto it would publish a Sydney event as
 * starting at 00:00 UTC. Truncating to the day keeps exactly what was asserted.
 */
export function normalizeDate(raw: unknown): string | undefined {
  const s = str(raw)
  if (!s) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    if (/(z|[+-]\d{2}:?\d{2})$/i.test(s)) return s
    return s.slice(0, 10)
  }
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : undefined
}

/** A gayout default/fallback asset is absence of an image, not an image.
 *  `validateEventSourceContract` flags these `E_IMAGE_PLACEHOLDER`; dropping
 *  them here keeps the row clean instead of staging a known defect. */
export const isPlaceholderImage = (u: string): boolean =>
  /\/images\/defaults\//i.test(u) ||
  /(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)/i.test(u)

export type ParsedEvent = Omit<GayoutEvent, 'sourceTypes' | 'eventType' | 'path'>

/**
 * Why a page yielded no event.
 *
 * THESE THREE ARE NOT THE SAME THING AND MUST NEVER BE COUNTED TOGETHER.
 *   * `no_ld`        — the page carried NO JSON-LD whatsoever. The fetch was
 *                      blocked, or the template changed. A parse regression;
 *                      surface it loudly.
 *   * `no_event_ld`  — JSON-LD is present (breadcrumbs, videos) but no
 *                      event-shaped block. This is gayout being HONEST: it omits
 *                      the `Event` block for an event whose date is not yet
 *                      announced, and the page renders "Date TBA". Measured on
 *                      `/africa/nigeria/lagos/mega-events/pride-in-lagos`.
 *                      EXPECTED, not a failure — and such a row could not
 *                      commit anyway, since `commit_event_staging_item` RAISEs
 *                      `event_missing_start_date`.
 *   * `incomplete`   — an event block exists but has no usable name or no start
 *                      date. Same commit consequence, different cause.
 *
 * Collapsing these into one counter is how "the source has 200 events we cannot
 * read" becomes indistinguishable from "200 events have no date yet".
 */
export type ParseFailure = 'no_ld' | 'no_event_ld' | 'incomplete'

export type ParseResult =
  | { ok: true; event: ParsedEvent }
  | { ok: false; reason: ParseFailure }

/**
 * Merge every event-shaped JSON-LD block on the page into one record.
 *
 * MERGING IS LOAD-BEARING AND SO IS THE LONGEST-WINS RULE FOR `description`.
 * gayout emits the same event twice — once as `Festival`, once as `Event` — and
 * the two disagree in BOTH directions:
 *   * the `Festival` block's description is TRUNCATED mid-word ("tribe-specifi")
 *     while the `Event` block carries the full three paragraphs;
 *   * `location.address.addressCountry` is present on `Festival`, absent on
 *     `Event`.
 * Taking the first block, or the last, loses real data either way. Publishing a
 * description cut mid-word is the defect CLAUDE.md records for the 500-char
 * truncated rows, so `description` takes the LONGEST candidate while every
 * other field takes the first non-empty one.
 */
export function parseEventLd(html: string, url: string, fallbackName: string): ParseResult {
  const all = ldBlocks(html)
  if (all.length === 0) return { ok: false, reason: 'no_ld' }
  const nodes = all.filter(n => typesOf(n).some(t => EVENT_TYPES.has(t)))
  if (nodes.length === 0) return { ok: false, reason: 'no_event_ld' }

  let name: string | undefined
  let description: string | undefined
  let start: string | undefined
  let end: string | undefined
  let city: string | undefined
  let country: string | undefined
  let venueName: string | undefined
  let organizerName: string | undefined
  let organizerUrl: string | undefined
  let ticketUrl: string | undefined
  let status: string | undefined
  const images = new Set<string>()

  for (const n of nodes) {
    name ??= str(n.name)
    const d = str(n.description)
    // longest wins — see the truncation note above
    if (d && (!description || d.length > description.length)) description = d
    start ??= normalizeDate(n.startDate)
    end ??= normalizeDate(n.endDate)
    status ??= str(n.eventStatus)

    const loc = n.location as Record<string, unknown> | undefined
    if (loc && typeof loc === 'object') {
      venueName ??= str(loc.name)
      const addr = loc.address as Record<string, unknown> | undefined
      if (addr && typeof addr === 'object') {
        city ??= str(addr.addressLocality)
        country ??= str(addr.addressCountry)
      }
    }

    const org = n.organizer as Record<string, unknown> | undefined
    if (org && typeof org === 'object') {
      organizerName ??= str(org.name)
      organizerUrl ??= str(org.url)
    }

    const offers = n.offers as Record<string, unknown> | Record<string, unknown>[] | undefined
    for (const o of Array.isArray(offers) ? offers : [offers]) {
      if (o && typeof o === 'object') ticketUrl ??= str((o as Record<string, unknown>).url)
    }

    const img = n.image
    for (const i of Array.isArray(img) ? img : [img]) {
      const s = str(i)
      if (s && !isPlaceholderImage(s)) images.add(s)
    }
  }

  const resolvedName = name ?? str(fallbackName)
  // No name or no start date means the row could not commit
  // (`commit_event_staging_item` RAISEs `event_missing_start_date`), so it is
  // reported rather than staged to fail later.
  if (!resolvedName || !start) return { ok: false, reason: 'incomplete' }

  return {
    ok: true,
    event: {
      url,
      name: resolvedName,
      description,
      start,
      end,
      city,
      country,
      venueName,
      images: [...images],
      organizerName,
      organizerUrl,
      ticketUrl,
      status,
    },
  }
}

/**
 * Country from the url path, used only when the JSON-LD omits it.
 *
 * Providing BOTH city and country is what makes `commit_event_staging_item`'s
 * geo resolution safe: it scopes the city lookup by `country_id` first, which
 * is the second independent signal the same-name-city problem needs (Portland
 * Maine vs Portland Oregon). A city with no country is the shape that produced
 * 122 mis-linked events.
 */
export function countryFromPath(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean)
  // {continent}/{country}/{city}/mega-events/{slug}
  if (parts.length < 5 || parts[3] !== 'mega-events') return undefined
  const slug = parts[1]
  if (!slug) return undefined
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, '')
  } catch {
    return url
  }
}

export const resolveEventType = (buckets: string[]): string => {
  for (const [bucket, mapped] of TYPE_PRECEDENCE) if (buckets.includes(bucket)) return mapped
  return 'other'
}
