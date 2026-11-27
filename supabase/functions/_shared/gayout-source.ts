/** Factual GayOut parsing. No editorial text, reviews, ratings or images. */
import { parentRefOf } from './jsonld-parent-ref.ts'
export type GayOutInventory = 'places' | 'events'
export type GayOutTarget = 'venues' | 'organizations' | 'events'
export interface GayOutSeed {
  url: string
  sourceId: string
  inventory: GayOutInventory
  countrySlug: string
  citySlug: string
  section: string
  targetTable: GayOutTarget
  category: string
  lastmod: string | null
}
export interface GayOutRecord {
  entityType: 'venue' | 'organization' | 'event'
  sourceName: 'gayout'
  sourceId: string
  name: string
  category?: string
  description?: string
  location: { country: string; city?: string; address?: string; lat?: number; lng?: number }
  contacts?: { website?: string; email?: string; phone?: string }
  dates?: { start: string; end?: string }
  venue_name?: string
  tags: string[]
  urls: string[]
  metadata: Record<string, unknown>
}
type ObjectValue = Record<string, unknown>
const CATEGORIES: Record<string, string> = {
  bars: 'bar', restaurants: 'restaurant', organizations: 'community_center',
  saunas: 'sauna', cruising: 'cruising', shops: 'shop', 'gay-heritage': 'other',
  beaches: 'outdoor', entertainment: 'event-venue', spas: 'other', gyms: 'gym', hotels: 'hotel',
}
export const GAYOUT_SITEMAPS: Record<GayOutInventory, string> = {
  places: 'https://www.gayout.com/sitemap-venues.xml',
  events: 'https://www.gayout.com/sitemap-events.xml',
}
export const GAYOUT_COUNTRY_ALIASES: Record<string, string> = {
  'cabo-verde': 'CV', 'democratic-republic-congo': 'CD', 'ivory-coast': 'CI',
  'sao-tome-and-principe': 'ST', 'republic-of-congo': 'CG', 'bosnia-herzegovina': 'BA',
  scotland: 'GB', 'trinidad-tobago': 'TT', 'st-kitts-and-nevis': 'KN',
}
const object = (v: unknown): ObjectValue | null => v != null && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : null
const string = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
function decodeGayOutText(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]
    const n = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10)
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ''
  })
}
const text = (v: unknown): string => decodeGayOutText(string(v).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const nameKey = (v: string): string => v.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

export function gayOutPublicUrl(input: string): URL | null {
  try {
    const u = new URL(decodeGayOutText(input))
    if (u.protocol !== 'https:' || !['www.gayout.com', 'gayout.com'].includes(u.hostname) || u.username || u.password || u.port) return null
    if (Array.from(u.pathname).some(char => char.charCodeAt(0) < 0x20)) return null
    u.hostname = 'www.gayout.com'; u.search = ''; u.hash = ''
    return u
  } catch { return null }
}
export function parseGayOutSeed(input: string, inventory: GayOutInventory, lastmod: string | null = null): GayOutSeed | null {
  const u = gayOutPublicUrl(input)
  if (!u) return null
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length !== 5) return null
  const [, countrySlug, citySlug, section] = parts
  if (inventory === 'places' ? !(section in CATEGORIES) : !['events', 'mega-events'].includes(section)) return null
  const sourceId = '/' + parts.join('/')
  return { url: 'https://www.gayout.com' + sourceId, sourceId, inventory, countrySlug, citySlug, section,
    targetTable: inventory === 'events' ? 'events' : section === 'organizations' ? 'organizations' : 'venues',
    category: CATEGORIES[section] || 'other', lastmod }
}
function isGayOutSitemapUrl(input: string): boolean {
  const u = gayOutPublicUrl(input)
  return !!u && /^\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.xml(?:\.gz)?$/i.test(u.pathname)
}
export function isGayOutChallenge(value: string, title = ''): boolean {
  return /^\s*Just a moment(?:\.{3})?\s*$/i.test(title) ||
    /<title[^>]*>\s*(?:Just a moment|Attention Required|Access denied)/i.test(value) ||
    (/(?:cf-chl-widget|id=["']challenge-running)/i.test(value) && !/application\/ld\+json/i.test(value)) ||
    (/performing security verification|verify you are (?:a )?human|verifies you are not a bot/i.test(value) && !/application\/ld\+json/i.test(value))
}
export function parseGayOutSitemap(xml: string, inventory: GayOutInventory): { entries: GayOutSeed[]; sitemaps: string[] } {
  if (isGayOutChallenge(xml)) throw new Error('E_GAYOUT_CHALLENGE: source returned a security verification page')
  if (!/<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(xml)) throw new Error('E_GAYOUT_SITEMAP_INVALID: expected an XML sitemap')
  const entries = new Map<string, GayOutSeed>(), sitemaps = new Set<string>()
  for (const match of xml.matchAll(/<(?:\w+:)?url\b[^>]*>([\s\S]*?)<\/(?:\w+:)?url>/gi)) {
    const loc = /<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/i.exec(match[1])?.[1]?.trim()
    const lastmod = /<(?:\w+:)?lastmod\b[^>]*>([\s\S]*?)<\/(?:\w+:)?lastmod>/i.exec(match[1])?.[1]?.trim() || null
    const seed = loc && parseGayOutSeed(loc, inventory, lastmod)
    if (seed) entries.set(seed.sourceId, seed)
  }
  for (const match of xml.matchAll(/<(?:\w+:)?sitemap\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sitemap>/gi)) {
    const loc = /<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/i.exec(match[1])?.[1]?.trim()
    if (loc && isGayOutSitemapUrl(decodeGayOutText(loc))) sitemaps.add(gayOutPublicUrl(decodeGayOutText(loc))!.toString())
  }
  if (!entries.size && !sitemaps.size) throw new Error('E_GAYOUT_SITEMAP_EMPTY: no supported source URLs; inventory was not advanced')
  return { entries: [...entries.values()], sitemaps: [...sitemaps] }
}
function gayOutJsonLd(html: string, parents?: WeakMap<ObjectValue, ObjectValue>): ObjectValue[] {
  const values: unknown[] = []
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { values.push(JSON.parse(script[1])) } catch { /* unrelated malformed markup cannot supply facts */ }
  }
  return flattenGayOutJsonLd(values, parents)
}
/** `parents`, when given, records each node reached through `subEvent` -> the node that held it. */
export function flattenGayOutJsonLd(values: unknown[], parents?: WeakMap<ObjectValue, ObjectValue>): ObjectValue[] {
  const out: ObjectValue[] = [], visit = (v: unknown, depth: number, parent?: ObjectValue) => {
    if (depth > 12) return
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1, parent); return }
    const o = object(v); if (!o) return
    if (o['@type']) out.push(o)
    if (parent && parents && !parents.has(o)) parents.set(o, parent)
    for (const field of ['@graph', 'mainEntity', 'itemListElement', 'item', 'subEvent']) if (o[field]) visit(o[field], depth + 1, field === 'subEvent' ? o : undefined)
  }
  visit(values, 0); return out
}
function externalUrl(v: unknown): string | undefined {
  try {
    const u = new URL(string(v))
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || /(^|\.)gayout\.com$/i.test(u.hostname)) return undefined
    if (/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/i.test(u.hostname)) return undefined
    return u.toString()
  } catch { return undefined }
}
function contactsFor(o: ObjectValue): GayOutRecord['contacts'] {
  const contacts: NonNullable<GayOutRecord['contacts']> = {}
  const phone = string(o.telephone), email = string(o.email).replace(/^mailto:/i, '')
  if (phone.replace(/\D/g, '').length >= 7 && phone.replace(/\D/g, '').length <= 15) contacts.phone = phone
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/@(?:example\.(?:com|org)|gayout\.com)$/i.test(email)) contacts.email = email
  const website = externalUrl(o.url) || externalUrl(o.website)
  if (website) contacts.website = website
  return Object.keys(contacts).length ? contacts : undefined
}
function locationFor(o: ObjectValue, seed: GayOutSeed, country: string): GayOutRecord['location'] {
  const addr = object(o.address), geo = object(o.geo)
  const city = text(addr?.addressLocality) || seed.citySlug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
  const location: GayOutRecord['location'] = { country, city }
  const address = text(addr?.streetAddress ?? (typeof o.address === 'string' ? o.address : ''))
  if (address && nameKey(address) !== nameKey(city) && !/^(?:unknown|n\/?a|contact\b|see website)/i.test(address)) location.address = address
  const lat = geo?.latitude, lng = geo?.longitude
  if (lat != null && lng != null && lat !== '' && lng !== '') {
    const a = Number(lat), b = Number(lng)
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0)) { location.lat = a; location.lng = b }
  }
  return location
}
function validTimestamp(v: unknown): string | null {
  const s = string(v)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return null
  const day = s.slice(0, 10), calendar = new Date(day + 'T00:00:00Z')
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(s))) return null
  return s
}
export function parseGayOutPage(input: { seed: GayOutSeed; country: string; html?: string; jsonLd?: unknown[]; sourceText?: string }): { records: GayOutRecord[]; reviewReason?: string; name?: string } {
  const { seed, country } = input, html = input.html || ''
  if (isGayOutChallenge(html)) throw new Error('E_GAYOUT_CHALLENGE: source returned a security verification page')
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('E_GAYOUT_COUNTRY_UNRESOLVED')
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html), heading = text(h1?.[1]) || text(/^# ([^\n]+)/m.exec(input.sourceText || '')?.[1])
  const headingContext = h1 ? text(html.slice(Math.max(0, (h1.index || 0) - 1000), (h1.index || 0) + h1[0].length + 200)) : ''
  const parents = new WeakMap<ObjectValue, ObjectValue>()
  const data = input.jsonLd ? flattenGayOutJsonLd(input.jsonLd, parents) : gayOutJsonLd(html, parents)
  const types = (o: ObjectValue) => (Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).map(string)
  const ownUrl = (o: ObjectValue) => {
    const u = gayOutPublicUrl(string(o.url) || string(o['@id']))
    return u?.pathname.replace(/\/$/, '') === seed.sourceId
  }
  const meta = { data_source: 'gayout', url: seed.url, lastmod: seed.lastmod, section: seed.section,
    city_slug: seed.citySlug, country_slug: seed.countrySlug, acquisition_method: 'backend_structured_data',
    ...(/\bUnverified\b/i.test(headingContext + ' ' + heading + ' ' + (input.sourceText || '').slice(0, 1200)) ? { source_unverified: true } : {}) }
  if (seed.inventory === 'events') {
    const lead = h1 ? text(html.slice((h1.index || 0) + h1[0].length, (h1.index || 0) + h1[0].length + 5000)) : (input.sourceText || '').slice(0, 5000)
    if (/\bDate TBA\b|dates? (?:not (?:yet )?announced|to be announced)/i.test(lead)) return { records: [], reviewReason: 'E_SOURCE_DATE_UNCONFIRMED', name: heading }
    const candidates = data.filter(o => types(o).some(t => /Event$|^Festival$/.test(t)))
    const matching = candidates.filter(ownUrl)
    const events = matching.length ? matching : candidates.length === 1 ? candidates : []
    const records: GayOutRecord[] = []
    for (const o of events) {
      const name = text(o.name), start = validTimestamp(o.startDate)
      if (!name || !start) continue
      const end = validTimestamp(o.endDate), loc = object(o.location) || {}
      const location = locationFor(loc, seed, country), venue = text(loc.name)
      const dates: { start: string; end?: string } = { start }
      if (end && Date.parse(end) > Date.parse(start)) dates.end = end
      const parentRef = parentRefOf(o, parents.get(o), text)
      const record: GayOutRecord = {
        entityType: 'event', sourceName: 'gayout', sourceId: seed.sourceId.replace(/^\/+/, '') + '#start=' + new Date(start).toISOString(), name,
        description: `${name}${venue ? ` at ${venue}` : ''}${location.city ? ` in ${location.city}` : ''}, ${start.slice(0, 10)}.`,
        location, dates, ...(venue ? { venue_name: venue } : {}), tags: ['lgbtq'], urls: [seed.url],
        metadata: { ...meta, event_type: 'other', description_source: 'generated_from_verified_facts', ...(parentRef ? { parent_ref: parentRef } : {}),
          ...(o.endDate && !dates.end ? { source_end_date: o.endDate, end_date_status: 'omitted_nonpositive_or_invalid_duration' } : {}) },
      }
      records.push(record)
    }
    return records.length ? { records: [...new Map(records.map(r => [r.sourceId, r])).values()] } : { records: [], reviewReason: 'E_SOURCE_DATE_OR_TIME_UNCONFIRMED', name: heading }
  }
  const candidates = data.filter(o => types(o).some(t => /LocalBusiness|Organization|NGO|BarOrPub|Restaurant|Hotel|Store|Place|SportsActivityLocation|HealthClub|Gym/.test(t)) && text(o.name) !== 'GayOut')
  const o = candidates.find(ownUrl) || candidates.find(o => heading && nameKey(text(o.name)) === nameKey(heading)) || (candidates.length === 1 ? candidates[0] : null)
  if (!o || text(o.name).length < 2) return { records: [], reviewReason: 'E_SOURCE_FACTS_UNAVAILABLE', name: heading }
  const name = text(o.name), location = locationFor(o, seed, country), contacts = contactsFor(o)
  if (!location.address && location.lat == null && !contacts) return { records: [], reviewReason: 'E_SOURCE_LOCATION_AND_CONTACT_MISSING', name }
  const organization = seed.targetTable === 'organizations'
  return { records: [{ entityType: organization ? 'organization' : 'venue', sourceName: 'gayout', sourceId: seed.sourceId,
    name, ...(organization ? {} : { category: seed.category }), location, ...(contacts ? { contacts } : {}),
    tags: ['queer-friendly'], urls: [seed.url], metadata: { ...meta, ...(organization ? { roles: ['community'] } : {}) } }] }
}
