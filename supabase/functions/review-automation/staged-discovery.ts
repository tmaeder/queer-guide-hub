import { parseLocation, urlsFromSitemap } from '../_shared/gaybasel-parse.ts'
import { fetchEvidence, sourceUrl } from './evidence.ts'
import type { Context, Evidence } from './policy.ts'

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const BASE = 'https://www.gaybasel.org'
const normalize = (v: string) => v.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const publicName = (v: unknown): v is string => typeof v === 'string' && v.length <= 300 && normalize(v).length >= 4

export function stagedDiscoveryId(context: Context): string | null {
  const id = context.proposal?.id
  const type = context.proposal?.entity_type
  return context.item.queue_type === 'staging' && !context.blocker && context.candidates.length > 0 &&
    (type === 'news_article' || type === 'venue') && typeof id === 'string' && UUID.test(id) ? id : null
}

type Stage = {
  source_name: string; source_type: string; target_table: string; source_entity_id: string | null
  normalized_data?: { name?: unknown; location?: { city?: unknown }; metadata?: { source_id?: unknown; media_type?: unknown } } | null
}
export type StagedTarget = { kind: 'news'; id: string; url: string; name: string } |
  { kind: 'venue'; id: string; name: string; city: string }

export function stagedTarget(row: Stage): StagedTarget | null {
  const n = row.normalized_data
  if (!row.source_entity_id || row.source_entity_id.length > 2048 || !publicName(n?.name)) return null
  if (row.source_name === 'rss-news' && row.source_type === 'rss-news' && row.target_table === 'news_articles' &&
    (!n.metadata?.media_type || n.metadata.media_type === 'article') &&
    typeof n.metadata?.source_id === 'string' && UUID.test(n.metadata.source_id)) {
    return { kind: 'news', id: n.metadata.source_id, url: row.source_entity_id, name: n.name }
  }
  const match = /^venue-(\d{1,9})$/.exec(row.source_entity_id)
  const city = n.location?.city
  if (row.source_name === 'gaybasel' && row.source_type === 'gaybasel' && row.target_table === 'venues' &&
    match && typeof city === 'string' && city.length <= 120 && normalize(city).length >= 2) {
    return { kind: 'venue', id: match[1], name: n.name, city }
  }
  return null
}

type Registry = { url: string; website_url?: string | null; is_active: boolean; auto_paused: boolean; source_type: string }

function articleUrl(value: string): URL {
  const url = sourceUrl(value.replace(/&(?:amp|#0*38);/g, '&'))
  for (const key of [...url.searchParams.keys()]) if (/^utm_[a-z_]+$/i.test(key)) url.searchParams.delete(key)
  url.hash = ''
  if (url.hostname === 'news.google.com' || url.pathname.length < 5 || /\/(?:feeds?|rss|atom)(?:\.[a-z]+)?\/?$/i.test(url.pathname)) throw new Error('Not a publisher article')
  return url
}

export function mergeStagedEvidence(existing: Evidence[], found: Evidence): Evidence[] {
  const key = (url: string) => {
    try { return articleUrl(url).href } catch { return url }
  }
  const recoveredKey = key(found.url)
  return [...existing.filter(page => key(page.url) !== recoveredKey), found]
}

/** Only a direct article tied to the active, exact RSS source; never aggregator text. */
export async function discoverStagedNews(target: Extract<StagedTarget, {kind:'news'}>, source: Registry, existing: Evidence[], fetcher: typeof fetch = fetch): Promise<Evidence | null> {
  if (!source.is_active || source.auto_paused || source.source_type !== 'rss') return null
  const origins = new Set([source.url, source.website_url].flatMap(value => {
    try { return value ? [sourceUrl(value).origin] : [] } catch { return [] }
  }))
  let url: URL
  try { url = articleUrl(target.url) } catch { return null }
  if (!origins.has(url.origin) || existing.some(page => page.url === url.href)) return null
  const page = await fetchEvidence(url.href, (input, init) => {
    const candidate = articleUrl(String(input))
    if (candidate.origin !== url.origin) throw new Error('Publisher origin changed')
    return fetcher(candidate, init)
  })
  return ` ${normalize(page.text)} `.includes(` ${normalize(target.name)} `) ? page : null
}

async function readGayBasel(url: URL, fetcher: typeof fetch, signal: AbortSignal): Promise<string> {
  const response = await fetcher(url, { redirect: 'error', signal, headers: { 'User-Agent': 'QueerGuide-ReviewResearch/1.0 (https://queer.guide)' } })
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('GayBasel source unavailable') }
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let total = 0, text = ''
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.length
      if (total > 524288) throw new Error('GayBasel source exceeds read limit')
      text += decoder.decode(next.value, { stream: true })
    }
    return text + decoder.decode()
  } finally { await reader.cancel().catch(() => {}) }
}

/** Match the publisher's exact location ID in its live sitemap, never guess a slug. */
export async function discoverStagedVenue(target: Extract<StagedTarget, {kind:'venue'}>, fetcher: typeof fetch = fetch): Promise<Evidence | null> {
  const signal = AbortSignal.timeout(10000)
  const xml = await readGayBasel(new URL(BASE + '/sitemap.xml'), fetcher, signal)
  const matches = urlsFromSitemap(xml).locations.flatMap(value => {
    try {
      const url = sourceUrl(value)
      const path = /^\/locations\/(\d+)\/[^/]+\/?$/.exec(url.pathname)
      return url.origin === BASE && path?.[1] === target.id && !url.search && !url.hash && !/%(?:2f|5c|2e|25)/i.test(url.pathname) ? [url] : []
    } catch { return [] }
  })
  if (matches.length !== 1) return null
  const url = matches[0]
  const location = parseLocation(await readGayBasel(url, fetcher, signal), url.href)
  if (!location?.city || !location.street || normalize(location.name) !== normalize(target.name) ||
    normalize(location.city) !== normalize(target.city)) return null
  return { url: url.href, retrieved_at: new Date().toISOString(), text: JSON.stringify({
    scope: 'Public publisher location entry. It does not establish consent, ownership, accessibility or publication eligibility.',
    name: location.name, city: location.city, street: location.street, postal: location.postal,
  }) }
}
