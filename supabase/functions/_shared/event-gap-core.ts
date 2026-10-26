// Pure evidence selection shared by both event gap workers.
import { assertPublicHttpUrl } from './ssrf-guard.ts'
import { extractGaychEventArtwork } from './gaych-parse.ts'

export type GapLane = 'content' | 'image'
export type GapEvent = Record<string, unknown> & { id: string; title: string }
export type SourceEvidence = { source_url?: string; source_slug?: string; raw?: Record<string, unknown> }
export type GapPatch = Record<string, unknown>

export function boundedInt(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(max, Math.trunc(value))) : fallback
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function cleanDescription(value: unknown): string | null {
  const raw = text(value)
  // This boundary accepts plain source text. Markup needs a real parser and is
  // deliberately left to grounded extraction, rather than filtered with regex.
  if (raw.includes('<') || raw.includes('>')) return null
  const entities: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'" }
  const s = raw.replace(/&(?:nbsp|amp|quot|#39);/gi, entity => entities[entity.toLowerCase()])
    .replace(/\s+/g, ' ').trim()
  if (s.length < 80 || /accept cookies|cookie policy|sign in to read|subscribe to continue|all rights reserved|privacy policy|erfasse deinen event schnell/i.test(s)) return null
  return s.slice(0, 20000)
}

export function eventPageUrl(raw: unknown): string | null {
  try {
    const u = assertPublicHttpUrl(text(raw).replace(/^"|"$/g, ''))
    if (u.username || u.password || !u.hostname.includes('.')) return null
    if (u.pathname === '/' && !u.search) return null
    return u.href
  } catch { return null }
}

export function sourceUrls(ev: GapEvent, sources: SourceEvidence[]): string[] {
  return [...new Set([ev.website, ev.ticket_url, ...sources.map(s => s.source_url)]
    .map(eventPageUrl).filter((u): u is string => !!u))].slice(0, 3)
}

export function storedDescription(sources: SourceEvidence[]): { description: string; source_url: string } | null {
  for (const s of sources) {
    const source_url = eventPageUrl(s.source_url)
    // Only raw source text; AI/enriched/normalized copies cannot corroborate themselves.
    const description = cleanDescription(s.raw?.description)
    if (source_url && description) return { description, source_url }
  }
  return null
}

function titleKey(value: unknown): string {
  return text(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

export function structuredEvent(html: string, ev: GapEvent): Record<string, unknown> | null {
  const scripts = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  function walk(v: unknown): Record<string, unknown>[] {
    if (Array.isArray(v)) return v.flatMap(walk)
    if (!v || typeof v !== 'object') return []
    const o = v as Record<string, unknown>
    const types = Array.isArray(o['@type']) ? o['@type'] : [o['@type']]
    return [...(types.some(t => /Event$/.test(String(t))) ? [o] : []), ...walk(o['@graph'])]
  }
  for (const script of scripts) {
    try {
      for (const node of walk(JSON.parse(script[1]))) {
        if (!titleKey(ev.title) || titleKey(node.name) !== titleKey(ev.title)) continue
        const sourceDate = text(node.startDate).slice(0, 10)
        const eventDate = text(ev.start_date).slice(0, 10)
        if (sourceDate && eventDate && Math.abs(Date.parse(sourceDate) - Date.parse(eventDate)) > 86400000) continue
        return node
      }
    } catch { /* Malformed JSON-LD is not evidence. */ }
  }
  return null
}

/** Only a matching, dated structured event can establish a cancellation signal. */
export function sourceCancellation(html: string, ev: GapEvent): string | null {
  const node = structuredEvent(html, ev)
  const sourceDate = Date.parse(text(node?.startDate))
  const canonicalDate = Date.parse(text(ev.start_date))
  if (!Number.isFinite(sourceDate) || !Number.isFinite(canonicalDate)
    || Math.abs(sourceDate - canonicalDate) > 86400000) return null
  const status = text(node?.eventStatus)
  return /^https?:\/\/schema\.org\/Event(?:Cancelled|Postponed)$/.test(status) ? status : null
}

export function imageCandidates(html: string, ev: GapEvent, pageUrl: string): string[] {
  const originals = extractGaychEventArtwork(html, ev, pageUrl)
  const structured = structuredEvent(html, ev)
  // Social-preview metadata may be a publisher logo, city cover or profile
  // photo. It cannot establish ownership of an event's artwork.
  const sourceStart = text(structured?.startDate)
  const sourceDay = sourceStart.slice(0, 10)
  const eventDay = text(ev.start_date).slice(0, 10)
  const sourceDate = Date.parse(sourceDay), eventDate = Date.parse(eventDay)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDay) || !Number.isFinite(Date.parse(sourceStart)) || !Number.isFinite(sourceDate)
    || !Number.isFinite(eventDate) || new Date(sourceDate).toISOString().slice(0, 10) !== sourceDay
    || Math.abs(sourceDate - eventDate) > 86400000) return originals
  const image = structured?.image
  const raw = (Array.isArray(image) ? image : [image]).map(v =>
    v && typeof v === 'object' ? (v as Record<string, unknown>).url : v)
  const candidates: string[] = []
  for (const v of raw) {
    if (!text(v)) continue
    try {
      const u = assertPublicHttpUrl(new URL(text(v).replace(/&amp;/g, '&'), pageUrl).href)
      if (['images.pexels.com', 'images.unsplash.com'].includes(u.hostname)) continue
      if (['gayout.com', 'www.gayout.com'].includes(u.hostname)
        && (/^\/uploads\/cities\//.test(u.pathname) || /\/(?:pexels|unsplash)[_-]/i.test(u.pathname))) continue
      if (!u.username && !u.password) candidates.push(u.href)
    } catch { /* Invalid image URL. */ }
  }
  return [...new Set([...originals, ...candidates])].slice(0, 3)
}

export function contentPatch(ev: GapEvent, ai: Record<string, unknown>): GapPatch {
  const patch: GapPatch = {}
  const confidence = typeof ai.confidence === 'number' ? ai.confidence : 0
  if (confidence < 0.8) return patch
  const description = cleanDescription(ai.description)
  if (text(ev.description).length < 80 && description) patch.description = description
  for (const field of ['accessibility_attributes', 'target_groups']) {
    if ((!Array.isArray(ev[field]) || !(ev[field] as unknown[]).length) && Array.isArray(ai[field])) {
      const values = [...new Set((ai[field] as unknown[]).map(text).filter(Boolean))].slice(0, 30)
      if (values.length) patch[field] = values
    }
  }
  if (!text(ev.age_restriction) && /^(all-ages|\d{1,2}\+)$/.test(text(ai.age_restriction))) patch.age_restriction = text(ai.age_restriction)
  if (confidence >= 0.9) {
    if (!text(ev.venue_name) && text(ai.extracted_venue_name)) patch.venue_name = text(ai.extracted_venue_name)
    if (!text(ev.address) && text(ai.extracted_address)) patch.address = text(ai.extracted_address)
  }
  return patch
}

export async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await fn(items[index])
    }
  }))
  return output
}

/** Model confidence alone is not evidence. Require a verbatim supporting span. */
export function supportedContentPatch(ev: GapEvent, ai: Record<string, unknown>, pageText: string): GapPatch {
  const patch = contentPatch(ev, ai)
  const quotes = ai.field_evidence && typeof ai.field_evidence === 'object'
    ? ai.field_evidence as Record<string, unknown> : {}
  const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
  const page = normalize(pageText)
  for (const field of Object.keys(patch)) {
    const key = field === 'venue_name' ? 'extracted_venue_name' : field === 'address' ? 'extracted_address' : field
    const quote = normalize(text(quotes[key]))
    if (quote.length < (field === 'description' ? 40 : 8) || !page.includes(quote)) delete patch[field]
  }
  return patch
}

export function hasUnverifiedLongRange(ev: GapEvent, now = Date.now()): boolean {
  const start = Date.parse(text(ev.start_date)), end = Date.parse(text(ev.end_date))
  const schedule = ev.schedule as Record<string, unknown> | null | undefined
  const supportedSchedule = schedule?.kind === 'recurrence' && ['feed', 'authored'].includes(text(schedule.confidence))
  return !supportedSchedule && ev.is_recurring !== true && Number.isFinite(start) && Number.isFinite(end)
    && start < now - 180 * 86400000 && end >= now
}

/** Event-owned feed assets avoid an HTML scrape; declared small images are skipped. */
export function sourceArtwork(sources: SourceEvidence[]): Array<{ url: string; source_url: string }> {
  const output: Array<{ url: string; source_url: string }> = []
  for (const source of sources) {
    if (source.source_slug !== 'agendaq' || !Array.isArray(source.raw?.assets)) continue
    const page = eventPageUrl(source.source_url)
    if (!page) continue
    const parsed = new URL(page)
    if (parsed.hostname !== 'www.agendaq.fr') continue
    const slug = parsed.pathname.split('/').filter(Boolean).at(-1)
    for (const asset of source.raw.assets) {
      if (!Array.isArray(asset) || typeof asset[1] !== 'string' || !asset[1].startsWith(`/assets/events/${slug}/`)) continue
      if (typeof asset[3] === 'number' && asset[3] > 0 && asset[3] < 450) continue
      if (typeof asset[4] === 'number' && asset[4] > 0 && asset[4] < 450) continue
      if (typeof asset[3] === 'number' && asset[3] > 0 && typeof asset[4] === 'number' && asset[4] > 0
        && Math.max(asset[3], asset[4]) < 800) continue
      try {
        const url = assertPublicHttpUrl(new URL(asset[1], 'https://data.agendaq.fr').href)
        if (url.hostname === 'data.agendaq.fr') output.push({ url: url.href, source_url: page })
      } catch { /* Invalid source asset. */ }
    }
  }
  return output.filter((v, i) => output.findIndex(x => x.url === v.url) === i).slice(0, 3)
}
