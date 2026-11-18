import { parse } from 'npm:parse5@8.0.1'

export const ORIGIN = 'https://www.prideplaces.org'
type Node = { nodeName: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] }
type Json = Record<string, unknown>
const object = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {}
const strings = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string')
export const clean = (v: unknown): string | undefined => typeof v === 'string' && !/^(?:n\/a|none|unknown|not available|two letters|-)$/i.test(v.trim()) ? v.trim() || undefined : undefined
const attr = (n: Node, name: string) => n.attrs?.find(a => a.name === name)?.value ?? ''
const hasClass = (n: Node, name: string) => attr(n, 'class').split(/\s+/).includes(name)
function walk(n: Node, fn: (node: Node) => void) { fn(n); for (const c of n.childNodes ?? []) walk(c, fn) }
function text(n: Node): string {
  if (['script', 'style'].includes(n.nodeName)) return ''
  return n.value ?? (n.childNodes ?? []).map(text).join(' ')
}
function assertHtml(html: string): void {
  if (html.length > 3_000_000) throw Error('Source document exceeds size budget')
  if (/^\s*(?:<[^>]+>)*\s*(?:Just a moment|Access Denied)/i.test(html) || /<title>[^<]*(?:Just a moment|Access Denied|Attention Required)/i.test(html)) throw Error('Source challenge page')
}
function document(html: string): Node {
  assertHtml(html)
  return parse(html) as Node
}
function linkedData(doc: Node): Json[] {
  const rows: Json[] = []
  walk(doc, n => {
    if (n.nodeName !== 'script' || attr(n, 'type').toLowerCase() !== 'application/ld+json') return
    try {
      const parsed = JSON.parse((n.childNodes ?? []).map(c => c.value ?? '').join(''))
      const values = Array.isArray(parsed) ? parsed : Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]
      for (const row of values) rows.push(object(row))
    } catch { /* A malformed unrelated schema block cannot supply business facts. */ }
  })
  return rows
}
function type(row: Json, name: string) { return strings(row['@type']).includes(name) }
export function sourceUrl(value: string, kind?: 'business' | 'event' | 'index'): string {
  const u = new URL(value, ORIGIN)
  if (u.origin !== ORIGIN || u.username || u.password) throw Error('Off-source URL rejected')
  u.hash = ''
  if (kind === 'event' && !/^\/events\/[^/]+\/?$/.test(u.pathname)) throw Error('Invalid event path')
  if (kind === 'business' && ((u.pathname.split('/').filter(Boolean).length < 3 && !/^\/pro\/[0-9]+\/?$/.test(u.pathname)) || /^\/(?:events|login|join|search_results)(?:\/|$)/.test(u.pathname))) throw Error('Invalid business path')
  if (kind === 'index' && !['/events', '/search_results'].includes(u.pathname)) throw Error('Invalid index path')
  const page = u.searchParams.get('page')
  u.search = ''
  if (kind === 'index' && page && Number(page) > 1 && /^\d+$/.test(page)) u.searchParams.set('page', String(Number(page)))
  return u.href
}
export interface Discovery { urls: string[]; pages: string[]; expected?: number }
export function discover(html: string, kind: 'business' | 'event', url: string): Discovery {
  const doc = document(html), urls = new Set<string>(), pages = new Set<string>()
  let expected: number | undefined
  walk(doc, n => {
    if (kind === 'business' && hasClass(n, 'total__js')) {
      const count = Number(text(n).replace(/[,\s]/g, ''))
      if (Number.isSafeInteger(count) && count >= 0) expected = count
    }
    if (n.nodeName !== 'a' || !attr(n, 'href')) return
    const href = attr(n, 'href')
    try {
      if (kind === 'business' ? hasClass(n, 'search_view_listing_button') : /^\/events\/[^/?#]+\/?$/.test(href) || /^https:\/\/www\.prideplaces\.org\/events\/[^/?#]+\/?$/.test(href)) urls.add(sourceUrl(href, kind))
      const next = new URL(href, ORIGIN)
      if (next.origin === ORIGIN && next.pathname === new URL(url).pathname && next.searchParams.has('page')) pages.add(sourceUrl(next.href, 'index'))
    } catch { /* Navigation and external links are not discovery results. */ }
  })
  if (kind === 'business') {
    if (expected === undefined || !urls.size || expected < urls.size) throw Error('Business directory count or listing markers missing')
    if (!new URL(url).searchParams.has('page')) {
      const count = Math.ceil(expected / urls.size)
      if (count > 1000) throw Error('Directory pagination exceeds budget')
      for (let p = 2; p <= count; p++) pages.add(`${ORIGIN}/search_results?page=${p}`)
    }
  } else if (!urls.size && !/\b(?:no events found|no upcoming events)\b/i.test(text(doc))) throw Error('Event directory markers missing')
  pages.delete(sourceUrl(url, 'index'))
  return { urls: [...urls].sort(), pages: [...pages].sort(), expected }
}
function category(main: string, sub: string): string {
  if (/nightlife/i.test(main)) return /dance|night club/i.test(sub) ? 'club' : 'bar'
  if (/food|restaurant|resturant/i.test(main)) return /cafe|coffee|tea/i.test(sub) ? 'cafe' : 'restaurant'
  if (/shopping/i.test(main)) return 'shop'
  if (/accommodation/i.test(main)) return /hotel|motel|bed.*breakfast|resort|lodg/i.test(sub) ? 'hotel' : 'other'
  if (/beauty/i.test(main)) return /hair|nail|barber|salon|spa/i.test(sub) ? 'salon' : 'other'
  if (/community/i.test(main)) return /community cent|youth cent|senior cent/i.test(sub) ? 'community_center' : 'other'
  if (/active/i.test(main)) return /fitness|gym/i.test(sub) ? 'gym' : 'other'
  if (/arts/i.test(main)) return /theat/i.test(sub) ? 'theater' : /galler/i.test(sub) ? 'gallery' : 'other'
  return 'other'
}
function location(address: Json, geo: Json): Json {
  const city = clean(address.addressLocality)
  const country = clean(typeof address.addressCountry === 'string' ? address.addressCountry : object(address.addressCountry).name)
  const loc: Json = { address: clean(address.streetAddress), city, state: clean(address.addressRegion), postal_code: clean(address.postalCode), country }
  const lat = Number(geo.latitude), lng = Number(geo.longitude)
  if (geo.latitude != null && geo.longitude != null && String(geo.latitude).trim() && String(geo.longitude).trim() && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) && !(lat === 38.7945952 && lng === -106.5348379 && !city)) Object.assign(loc, { lat, lng })
  return loc
}
export function parseBusiness(html: string, url: string): Json {
  url = sourceUrl(url, 'business')
  assertHtml(html)
  // Directory detail pages contain large navigation and login templates. Parse
  // only factual schema blocks and the fallback heading to stay within Edge CPU.
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)].map(m => m[0]).join('')
  const headingHtml = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? ''
  const doc = document(scripts + headingHtml), nodes = linkedData(doc)
  const b = nodes.find(n => type(n, 'LocalBusiness'))
  const profile = nodes.find(n => type(n, 'ProfilePage'))
  let heading: string | undefined
  walk(doc, n => { if (n.nodeName === 'h1' && !heading) heading = clean(text(n)) })
  const name = clean(b?.name) ?? heading
  if (!name) throw Error('Business identity missing')
  const loc = location(object(b?.address), object(b?.geo))
  const main = strings(profile?.about)[0] ?? decodeURIComponent(new URL(url).pathname.split('/').at(-2) ?? '').replaceAll('-', ' ')
  const sub = strings(b?.knowsAbout), sameAs = strings(b?.sameAs)
  const websites = sameAs.filter(u => {
    try { return /^https?:\/\//i.test(u) && !/(?:^|\.)(facebook|instagram|twitter|linkedin|youtube|yelp|tiktok|prideplaces)\./i.test(new URL(u).hostname) }
    catch { return false }
  })
  const phone = clean(b?.telephone)
  return {
    sourceId: url, sourceName: 'prideplaces', entityType: 'venue', name,
    description: `${name} is listed by Pride Places under ${main}${sub.length ? ` (${sub.join(', ')})` : ''}${loc.city ? ` in ${loc.city}${loc.state ? ', ' + loc.state : ''}` : ''}.`,
    category: category(main, sub.join(', ')), location: loc,
    contacts: { phone: phone && !/^(?:0?1234567890|0{6,})$/.test(phone.replace(/\D/g, '')) ? phone : undefined, website: websites[0] },
    website: websites[0], urls: [url, ...websites], images: [], tags: [],
    metadata: { url, source: 'prideplaces', source_category: main, source_subcategories: sub, social_links: sameAs.filter(u => !websites.includes(u)), incomplete_business_profile: !b, content_scope: 'factual_directory_listing', lgbtq_claim: 'Listed in Pride Places LGBTQ+ friendly business directory; ownership not inferred' },
  }
}

/** Enumerating possible offsets rejects both DST gaps and repeated local times. */
export function localInstant(day: string, clock: string, timezone: string): string | undefined {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clock)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !m || +m[1] < 1 || +m[1] > 12 || +m[2] > 59) return
  const hour = +m[1] % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0)
  const target = `${day}T${String(hour).padStart(2, '0')}:${m[2]}`
  const base = Date.parse(`${target}:00Z`), matches = new Set<string>()
  if (!Number.isFinite(base)) return
  let fmt: Intl.DateTimeFormat
  try { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) } catch { return }
  // Modern IANA civil offsets are multiples of 15 minutes, between UTC-12 and +14.
  for (let offset = -12 * 60; offset <= 14 * 60; offset += 15) {
    const date = new Date(base - offset * 60000)
    const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]))
    if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === target) matches.add(date.toISOString())
  }
  if (matches.size === 1) return [...matches][0]
}
export interface EventContext { timezone?: string; venueId?: string; city?: string; country?: string }
export function parseEvent(html: string, url: string, context: EventContext = {}): Json {
  url = sourceUrl(url, 'event')
  const doc = document(html), e = linkedData(doc).find(n => type(n, 'Event'))
  if (!e || !clean(e.name)) throw Error('Event identity missing')
  let box = ''
  walk(doc, n => { if (hasClass(n, 'event-date-info')) box = text(n).replace(/\s+/g, ' ').trim() })
  const date = /Next Start Date\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(box)
  const candidate = date ? `${date[3]}-${date[1]}-${date[2]}` : undefined
  const dateMs = candidate ? Date.parse(`${candidate}T12:00:00Z`) : Number.NaN
  const day = Number.isFinite(dateMs) && new Date(dateMs).toISOString().slice(0, 10) === candidate ? candidate : undefined
  const startClock = /Start Time\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(box)?.[1]
  const endClock = /End Time\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(box)?.[1]
  const start = day && startClock && context.timezone ? localInstant(day, startClock, context.timezone) : undefined
  let end = day && endClock && context.timezone ? localInstant(day, endClock, context.timezone) : undefined
  if (start && end && end < start) {
    const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
    end = localInstant(next, endClock!, context.timezone!)
  }
  const place = object(e.location), loc = location(object(place.address), object(place.geo))
  if (context.city) loc.city = context.city
  if (context.country && !loc.country) loc.country = context.country
  if (context.timezone) loc.timezone = context.timezone
  const weekly = /recurs\s+every week/i.test(box)
  return {
    // A URL-only identity is reserved for an incomplete Review record. It is
    // never an invented occurrence; published occurrences retain date keys.
    sourceId: day ? `${url}:${day}` : url, sourceName: 'prideplaces', entityType: 'event', name: e.name, title: e.name,
    description: `${e.name}${place.name ? ` at ${place.name}` : ''}${loc.city ? ` in ${loc.city}` : ''}, listed by Pride Places${weekly ? ' as a weekly event' : ''}.`,
    event_type: /angels/i.test(String(e.name)) ? 'drag' : /trivia/i.test(String(e.name)) ? 'social' : 'party',
    start_date: start, end_date: end, dates: start ? { start, end } : undefined,
    venue_id: context.venueId, venue_name: place.name, website: url, urls: [url], images: [], location: loc,
    is_recurring: weekly, recurrence_pattern: weekly ? 'weekly' : undefined,
    recurrence_rule: weekly && day ? { freq: 'WEEKLY', interval: 1, byDay: [['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(`${day}T12:00:00Z`).getUTCDay()]] } : undefined,
    metadata: { url, source: 'prideplaces', source_next_date: day, source_date_raw: candidate, date_unknown: !day, source_start_time: startClock, source_end_time: endClock, time_unknown: !start, stale_jsonld_start: e.startDate, content_scope: 'factual_event_listing', requires_review: !start || !context.venueId || Boolean(endClock && !end), timezone_source: context.timezone ? 'matched_canonical_venue' : undefined },
  }
}

/** Hash only source facts, excluding capture times, prose, media and operational metadata. */
export function facts(item: Json): Json {
  const m = object(item.metadata)
  return { name: item.name ?? item.title, category: item.category, location: item.location, contacts: item.contacts, website: item.website, urls: item.urls,
    start_date: item.start_date, end_date: item.end_date, venue_id: item.venue_id, venue_name: item.venue_name,
    is_recurring: item.is_recurring, recurrence_rule: item.recurrence_rule,
    source_category: m.source_category, source_subcategories: m.source_subcategories, social_links: m.social_links,
    incomplete_business_profile: m.incomplete_business_profile === true, source_next_date: m.source_next_date, source_date_raw: m.date_unknown === true ? m.source_date_raw : undefined, source_start_time: m.source_start_time, source_end_time: m.source_end_time }
}
export function stable(value: unknown): string {
  if (value == null) return 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v != null).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
  return JSON.stringify(value)
}
export async function factHash(item: Json): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(facts(item)))))].map(n => n.toString(16).padStart(2, '0')).join('')
}
