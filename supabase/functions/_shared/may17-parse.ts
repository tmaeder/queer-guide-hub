// ============================================================
// may17.org — IDAHOBIT's own registry of actions, read from its public The Events
// Calendar REST API (/wp-json/tribe/events/v1/events). No key, robots `Allow: /`,
// no terms page or reuse clause (checked 2026-11-22); organisers register events
// in order to have them published ("Only actions connected to IDAHOBIT will be
// published").
//
// Measured 2026-11-22 over the 230 events of 2026:
//  - the VENUE record is not a venue: it is "Online" (9), a country ("United
//    Kingdom", 11 where venue == country), a city ("Nairobi") or occasionally a real
//    place ("Siam Paragon"). It is never staged as venue_name — a country name fed to
//    the event->venue linker is the place-collision class. city/country/address are
//    kept in `location`.
//  - coordinates on 17/230, city on 193/230, country on 213/230, 16 online-only.
//  - titles carry HTML entities ("&amp;"); descriptions are HTML.
//  - 116/230 titles name the day. Being listed here IS the name signal (see the
//    observance_sources migration), so the source tag below is load-bearing.
// ============================================================

import { decodeEntities, stripTagsAndDecode } from './html-entities.ts'
import { inferEventType } from './berlin-events-parse.ts'

export interface May17Venue {
  venue?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  zip?: string | null
  stateprovince?: string | null
  geo_lat?: number | string | null
  geo_lng?: number | string | null
}

export interface May17Raw {
  id?: number
  status?: string
  url?: string
  title?: string
  description?: string | null
  excerpt?: string | null
  all_day?: boolean
  utc_start_date?: string | null // "2026-05-07 16:00:00"
  utc_end_date?: string | null
  timezone?: string | null
  website?: string | null
  image?: { url?: string } | false | null
  venue?: May17Venue | unknown[] | null
  is_virtual?: boolean
  hide_from_listings?: boolean
}

export interface May17Event {
  id: string
  title: string
  description: string | null
  start: string // ISO UTC
  end: string | null
  allDay: boolean
  timezone: string | null
  url: string
  website: string | null
  image: string | null
  address: string | null
  city: string | null
  state: string | null
  postal: string | null
  country: string | null
  lat: number | null
  lng: number | null
  online: boolean
  eventType: string
}

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
/** "2026-05-07 16:00:00" (UTC) -> "2026-05-07T16:00:00.000Z" */
const utcIso = (v: unknown): string | null => {
  const s = text(v)
  if (!s || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return null
  const d = new Date(`${s.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** One API event -> the staged shape, or null when it cannot be published. */
export function normalizeMay17Event(raw: May17Raw): May17Event | null {
  if (raw.status && raw.status !== 'publish') return null
  if (raw.hide_from_listings) return null
  const id = raw.id != null ? String(raw.id) : null
  const title = text(raw.title) ? decodeEntities(raw.title!).trim() : null
  const start = utcIso(raw.utc_start_date)
  const url = text(raw.url)
  if (!id || !title || !start || !url) return null

  // The REST API returns `venue: []` when an event has none.
  const v: May17Venue = raw.venue && !Array.isArray(raw.venue) ? (raw.venue as May17Venue) : {}
  const description = text(raw.description) ? stripTagsAndDecode(raw.description!).trim() || null : null
  const image = raw.image && typeof raw.image === 'object' ? text(raw.image.url) : null

  // Measured 2026-11-22: 6 of 124 events in 2025 carry a utc_end_date BEFORE the start
  // (local midnight of the day before, or the post's creation time). An end that precedes
  // the start is upstream noise; dropping it keeps the event instead of failing validation.
  const end = utcIso(raw.utc_end_date)

  return {
    id,
    title,
    description,
    start,
    end: end && end > start ? end : null,
    allDay: raw.all_day === true,
    timezone: text(raw.timezone),
    url,
    website: text(raw.website),
    image,
    address: text(v.address),
    city: text(v.city),
    state: text(v.stateprovince),
    postal: text(v.zip),
    country: text(v.country),
    lat: num(v.geo_lat),
    lng: num(v.geo_lng),
    online: raw.is_virtual === true,
    eventType: inferEventType(title, description),
  }
}

export function normalizeMay17Page(items: May17Raw[]): May17Event[] {
  return items.map(normalizeMay17Event).filter((e): e is May17Event => e !== null)
}
