// ============================================================
// qcal.app — pure shape mapping for the /api/events/search payload.
//
// qcal is a Next.js app whose listing is client-rendered, but the data it
// renders from is a plain public JSON endpoint: GET /api/events/search
// returns { items, total, page, pageSize }. No key, no HTML parsing.
//
// `pageSize` caps at 50 SERVER-SIDE. Measured 2026-09-28: `?pageSize=100`
// returns 50 and echoes `pageSize: 50`, while `?limit=` and `?perPage=` are
// ignored entirely and fall back to 30. Paginate with `page`; anything else
// silently re-reads the head, which is the selector-starvation shape this
// codebase has been bitten by repeatedly.
//
// `total` COUNTS INSTANCES, NOT EVENTS. Measured 2026-09-28: the API reports
// total 261 and the six pages really do carry 261 rows — but only 51 DISTINCT
// slugs. A weekly bingo night is 54 separate rows sharing one slug, each with
// its own `nextStart`. Staging per row would publish 54 near-identical events
// and hand the dedup engine a pile it should never have been given; the
// corpus models a recurring night as one event. So 51 is the correct yield
// and "we only got 51 of 261" is the expected reading, not a paging bug.
//
// THE FEED IS ASCENDING BY nextStart AND FIRST-SEEN IS THEREFORE EARLIEST —
// verified across all 16 multi-instance slugs, 0 exceptions. That is what
// makes keeping the first occurrence correct rather than arbitrary: the row
// staged is the next upcoming instance, which is what a reader wants.
//
// COVERAGE, measured over the first 50 of 261 (2026-09-28): slug, title,
// timezone, nextStart, nextEnd and locations[0].address.{city,country} are
// present on 50/50, geo coordinates on 50/50, imagePath on 48/50. So the
// fields this maps are the fields the API actually fills — nothing here is
// speculative padding.
// ============================================================

import { inferEventType } from './berlin-events-parse.ts'

export interface QcalRaw {
  _id?: string
  slug?: string
  title?: string
  status?: string
  attendanceMode?: string
  timezone?: string
  nextStart?: string
  nextEnd?: string
  imagePath?: string
  free?: boolean
  currency?: string
  priceMin?: number
  priceMax?: number
  seriesSummary?: string
  cardLine?: string
  hosts?: Array<{ name?: string; slug?: string }>
  locations?: Array<{
    full_address?: string
    geo?: { type?: string; coordinates?: number[] }
    address?: {
      house_number?: string
      road?: string
      city?: string
      state?: string
      postcode?: string
      country?: string
    }
  }>
}

export interface QcalEvent {
  slug: string
  title: string
  url: string
  start: string
  end: string | null
  timezone: string | null
  description: string | null
  image: string | null
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  postal: string | null
  country: string | null
  lat: number | null
  lng: number | null
  eventType: string
  online: boolean
  host: string | null
}

const SITE = 'https://qcal.app'

/**
 * Street address only — never the full one-line address.
 *
 * `full_address` is "4545 Park Blvd #101, San Diego, CA 92116, USA", i.e. it
 * repeats the city, state, postcode and country that are already carried in
 * their own columns. `commit_event_staging_item` writes `location.address`
 * straight into `events.address`, so passing the composite duplicates every
 * geo field into the street line and makes the rendered address read twice.
 */
function streetOf(a: NonNullable<QcalRaw['locations']>[number]['address']): string | null {
  if (!a) return null
  const street = [a.house_number, a.road].filter((p) => p && p.trim()).join(' ').trim()
  return street || null
}

/**
 * GeoJSON is [lng, lat] — the opposite order to every other field in this repo.
 *
 * Getting this backwards puts a San Diego event at lat -117, which is outside
 * the legal latitude range, so `E_LATITUDE_RANGE` would catch it at write
 * time. That is a cheap catch and it is still worth being explicit: the
 * contract only rejects values past ±90, and a Zurich event silently swapped
 * to (8.5, 47.4) lands in Somalia without tripping anything.
 */
function geoOf(loc: NonNullable<QcalRaw['locations']>[number] | undefined): { lat: number | null; lng: number | null } {
  const c = loc?.geo?.coordinates
  if (!Array.isArray(c) || c.length < 2) return { lat: null, lng: null }
  const [lng, lat] = c
  if (typeof lat !== 'number' || typeof lng !== 'number') return { lat: null, lng: null }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null }
  // (0,0) is the API's "unset" sentinel, not a real place in the Gulf of
  // Guinea. The write contract raises E_GEO_NULL_ISLAND on it; drop it here
  // so the row stages clean instead of carrying a known-bad pair.
  if (lat === 0 && lng === 0) return { lat: null, lng: null }
  return { lat, lng }
}

/**
 * Map one API item, or null if it cannot become a valid event.
 *
 * Returns null rather than a partial row for the two conditions the commit
 * RPC hard-rejects anyway (`event_missing_title`, `event_missing_start_date`).
 * Banking a row to learn what is already knowable is waste.
 */
export function normalizeQcalEvent(raw: QcalRaw): QcalEvent | null {
  const slug = (raw.slug ?? '').trim()
  const title = (raw.title ?? '').trim()
  const start = (raw.nextStart ?? '').trim()
  if (!slug || !title || !start) return null
  if (raw.status && raw.status !== 'published') return null

  const loc = raw.locations?.[0]
  const addr = loc?.address
  const { lat, lng } = geoOf(loc)
  const end = (raw.nextEnd ?? '').trim() || null

  // An end before its start is upstream noise, not a fact about the event.
  // The contract raises E_DATE_ORDER_INVALID; dropping just the end keeps the
  // event rather than staging it with a defect.
  const endOk = end && Date.parse(end) >= Date.parse(start) ? end : null

  const online = raw.attendanceMode === 'online'

  return {
    slug,
    title,
    url: `${SITE}/event/${slug}`,
    start,
    end: endOk,
    timezone: (raw.timezone ?? '').trim() || null,
    description: (raw.seriesSummary ?? '').trim() || null,
    image: raw.imagePath ? `${SITE}${raw.imagePath}` : null,
    // qcal has no venue field at all — `full_address` is a postal address and
    // the host is an organiser, not a place. Emitting either as venue_name
    // feeds the event->venue linker a string that is not a venue, which is the
    // documented place-collision failure (15 of 65 name_exact matches were
    // places). Null is the honest answer.
    venueName: null,
    address: streetOf(addr),
    city: (addr?.city ?? '').trim() || null,
    state: (addr?.state ?? '').trim() || null,
    postal: (addr?.postcode ?? '').trim() || null,
    country: (addr?.country ?? '').trim() || null,
    lat,
    lng,
    eventType: inferEventType(title, raw.seriesSummary, raw.cardLine),
    online,
    host: raw.hosts?.[0]?.name?.trim() || null,
  }
}

export function normalizeQcalPage(items: QcalRaw[]): QcalEvent[] {
  const out: QcalEvent[] = []
  const seen = new Set<string>()
  for (const raw of items) {
    const e = normalizeQcalEvent(raw)
    if (!e || seen.has(e.slug)) continue
    seen.add(e.slug)
    out.push(e)
  }
  return out
}
