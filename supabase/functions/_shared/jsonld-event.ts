// Generic schema.org Event reader for arbitrary organiser pages.
//
// Used by source-observance-events, whose input is a hand-curated list of
// organiser URLs (Eventbrite, Squarespace, The Events Calendar, Humanitix,
// Meetup, city calendars). Those platforms differ in everything except one
// thing: they publish the event as application/ld+json for search engines. So
// this reads that block and nothing else — no CSS selectors, no prose parsing.
// A page without a parseable Event yields [] and is reported, never guessed.

import { decodeEntities } from './html-entities.ts'

export interface JsonLdEvent {
  title: string
  /** ISO 8601 as published (offset normalised to ±HH:MM). */
  start: string
  end: string | null
  description: string | null
  url: string
  image: string | null
  venueName: string | null
  street: string | null
  city: string | null
  region: string | null
  postal: string | null
  /** Upper-cased when it is a 2-letter code; free text ("Germany") otherwise. */
  country: string | null
  lat: number | null
  lng: number | null
  online: boolean
}

type Obj = Record<string, unknown>

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = decodeEntities(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return s || null
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const types = (o: Obj): string[] => {
  const t = o['@type']
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string')
}
const isEvent = (o: Obj) => types(o).some((t) => /Event$/.test(t))

/** "2026-12-01T17:30:00-0500" -> "...-05:00"; Date.parse rejects the colon-less form. */
export function normaliseIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  return Number.isNaN(Date.parse(s)) ? null : s
}

function firstUrl(v: unknown): string | null {
  if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
  if (Array.isArray(v)) for (const x of v) { const u = firstUrl(x); if (u) return u }
  if (v && typeof v === 'object') return firstUrl((v as Obj).url ?? (v as Obj)['@id'])
  return null
}

function place(loc: unknown): Pick<JsonLdEvent, 'venueName' | 'street' | 'city' | 'region' | 'postal' | 'country' | 'lat' | 'lng' | 'online'> {
  const out = { venueName: null, street: null, city: null, region: null, postal: null, country: null, lat: null, lng: null, online: false } as ReturnType<typeof place>
  const locs = (Array.isArray(loc) ? loc : [loc]).filter((l): l is Obj => !!l && typeof l === 'object')
  const physical = locs.find((l) => !types(l).includes('VirtualLocation'))
  out.online = locs.some((l) => types(l).includes('VirtualLocation'))
  if (!physical) return out
  out.venueName = str(physical.name)
  const a = physical.address
  if (typeof a === 'string') out.street = str(a)
  else if (a && typeof a === 'object') {
    const ad = a as Obj
    out.street = str(ad.streetAddress)
    out.city = str(ad.addressLocality)
    out.region = str(ad.addressRegion)
    out.postal = str(ad.postalCode)
    const c = ad.addressCountry
    const cs = str(c && typeof c === 'object' ? (c as Obj).name : c)
    out.country = cs && /^[a-z]{2}$/i.test(cs) ? cs.toUpperCase() : cs
  }
  const g = physical.geo as Obj | undefined
  if (g && typeof g === 'object') { out.lat = num(g.latitude); out.lng = num(g.longitude) }
  return out
}

/**
 * Every schema.org Event on the page that starts at or after `notBefore`.
 * Walks @graph and nested arrays; an unparseable block is skipped, not fatal.
 */
export function extractJsonLdEvents(html: string, pageUrl: string, notBefore = new Date(0)): JsonLdEvent[] {
  const out: JsonLdEvent[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let json: unknown
    try { json = JSON.parse(m[1].trim()) } catch { continue }
    const stack: unknown[] = [json]
    while (stack.length) {
      const x = stack.pop()
      if (Array.isArray(x)) { stack.push(...x); continue }
      if (!x || typeof x !== 'object') continue
      const o = x as Obj
      for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v)
      if (!isEvent(o)) continue
      const title = str(o.name)
      const start = normaliseIsoDate(o.startDate)
      if (!title || !start || Date.parse(start) < notBefore.getTime()) continue
      const url = firstUrl(o.url) ?? pageUrl
      const key = `${url}|${start}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        title,
        start,
        end: normaliseIsoDate(o.endDate),
        description: str(o.description),
        url,
        image: firstUrl(o.image),
        ...place(o.location),
      })
    }
  }
  return out
}
