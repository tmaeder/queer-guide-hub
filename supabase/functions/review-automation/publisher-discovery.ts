import { fetchEvidence, sourceUrl } from './evidence.ts'
import type { Context, Evidence } from './policy.ts'

// Public detail pages of providers already integrated into the source catalogue.
const PUBLISHERS = {
  event: {
    qcal: ['qcal.app', /^\/event\/[^/]+\/?$/],
    siegessaeule: ['www.siegessaeule.de', /^\/termine\/[^/]+\/[^/]+\/\d{4}-\d{2}-\d{2}(?:\/[^/]+)?\/?$/],
    'display-magazin': ['www.display-magazin.ch', /^\/event\/[^/]+\/?$/],
    'gay-ch': ['gay.ch', /^\/parties\/[^/]+\/?$/],
    'haz-ch': ['haz.ch', /^\/event\/[^/]+\/?$/],
    lgbtnetwork: ['lgbtnetwork.org', /^\/events\/[^/]+\/?$/],
    ticketcorner: ['www.ticketcorner.ch', /^\/event\/[^/]+\/?$/],
  },
  venue: {
    gaybasel: ['www.gaybasel.org', /^\/locations\/\d+\/[^/]+\/?$/],
    spartacus: ['spartacus.gayguide.travel', /^\/goingout\/[^/]+\/[^/]+\/\d+_[^/]+\/?$/],
  },
} satisfies Record<string, Record<string, [string, RegExp]>>
const EVENT_QUEUES = new Set(['event-quality', 'general-review'])
const VENUE_QUEUES = new Set(['quality-venue', 'venue-category', 'business-quality'])
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const normalise = (v: string) => v.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export type PublisherTarget = {
  kind: keyof typeof PUBLISHERS; id: string; name: string; city: string; start?: string; date?: string
  table: 'event_sources' | 'venue_sources'; foreignKey: 'event_id' | 'venue_id'; slugs: string[]
}
export function publisherTarget(context: Context): PublisherTarget | null {
  const r = context.record
  if (context.blocker || !context.candidates.length || !r || r.duplicate_of_id ||
      typeof r.id !== 'string' || !UUID.test(r.id)) return null
  const city = (context.related.location as { city?: unknown } | undefined)?.city
  if (typeof city !== 'string' || normalise(city).length < 2 || city.length > 120) return null
  if (EVENT_QUEUES.has(context.item.queue_type) && typeof r.start_date === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(r.start_date) && typeof r.title === 'string' &&
      normalise(r.title).length >= 5 && r.title.length <= 160) {
    return { kind: 'event', id: r.id, name: r.title, city, start: r.start_date, table: 'event_sources', foreignKey: 'event_id', slugs: Object.keys(PUBLISHERS.event) }
  }
  // Publicly listed venues only. A provider listing never establishes sensitive
  // traits, accessibility, consent, ownership or current operating status.
  if (VENUE_QUEUES.has(context.item.queue_type) && r.seo_indexable === true && !r.closed_at &&
      typeof r.name === 'string' && normalise(r.name).length >= 5 && r.name.length <= 160) {
    return { kind: 'venue', id: r.id, name: r.name, city, table: 'venue_sources', foreignKey: 'venue_id', slugs: Object.keys(PUBLISHERS.venue) }
  }
  return null
}

export function eventPublisherDate(start: string, timezone: unknown): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start
  const timestamp = start.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (typeof timezone !== 'string' || !timezone || !/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return null
  const instant = new Date(timestamp)
  if (!Number.isFinite(instant.valueOf())) return null
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(p => [p.type, p.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  } catch { return null }
}

function matchesOccurrence(body: string, date: string): boolean {
  const parsed = new Date(date + 'T00:00:00Z')
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return false
  const formats = [date, ...['en-GB', 'en-US', 'fr-FR', 'de-DE'].map(locale =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(parsed))]
  return formats.some(formatted => body.includes(` ${normalise(formatted)} `))
}

type CatalogueRow = { source_slug: string; source_url: string | null }
export async function discoverPublisherEvidence(target: PublisherTarget, rows: CatalogueRow[], existing: Evidence[], fetcher: typeof fetch = fetch) {
  if (target.kind === 'event' && !target.date) return { evidence: null, attempted: 0, unavailable: 0 }
  const rules: Record<string, [string, RegExp]> = PUBLISHERS[target.kind]
  const seen = new Set(existing.map(page => page.url))
  let attempted = 0, unavailable = 0
  for (const row of rows.slice(0, 8)) {
    if (attempted >= 2) break
    if (!Object.hasOwn(rules, row.source_slug) || !row.source_url || row.source_url.length > 2048) continue
    const [host, path] = rules[row.source_slug]
    const allowed = (input: string) => {
      const url = sourceUrl(input)
      if (url.hostname !== host || url.search || /%(?:2f|5c|2e|25)/i.test(url.pathname) || !path.test(url.pathname)) throw new Error('Publisher detail URL refused')
      url.hash = ''
      return url
    }
    let url: URL
    try { url = allowed(row.source_url) } catch { continue }
    if (seen.has(url.href)) continue
    seen.add(url.href)
    attempted++
    try {
      // Revalidate every redirect before making the request, including path.
      const page = await fetchEvidence(url.href, (input, init) => fetcher(allowed(String(input)), init))
      const body = ` ${normalise(page.text)} `
      if (body.includes(` ${normalise(target.name)} `) && body.includes(` ${normalise(target.city)} `) &&
          (target.kind === 'venue' || !!target.date && matchesOccurrence(body, target.date))) {
        return { evidence: page, attempted, unavailable }
      }
    } catch { unavailable++ }
  }
  return { evidence: null, attempted, unavailable }
}
