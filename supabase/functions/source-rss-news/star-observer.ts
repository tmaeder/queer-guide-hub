import { parseRssItems } from './rss-parse.ts'

export const STAR_OBSERVER_SYNDICATION = 'https://www.bing.com/news/search?q=site%3Astarobserver.com.au&format=rss&setlang=en-AU&cc=au'

function hasCredentialsOrPort(url: URL): boolean {
  return [url.username, url.password, url.port].some(value => value.length > 0)
}

export function isStarObserverFeed(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !hasCredentialsOrPort(url) && !url.search && !url.hash
      && ['starobserver.com.au', 'www.starobserver.com.au'].includes(url.hostname) && /^\/feed\/?$/.test(url.pathname)
  } catch { return false }
}

function publisherArticle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    let url = new URL(raw)
    if (['http:', 'https:'].includes(url.protocol) && ['www.bing.com', 'bing.com'].includes(url.hostname) && url.pathname === '/news/apiclick.aspx' && !hasCredentialsOrPort(url)) {
      url = new URL(url.searchParams.get('url') || '')
    }
    if (url.protocol !== 'https:' || hasCredentialsOrPort(url)
      || !['starobserver.com.au', 'www.starobserver.com.au'].includes(url.hostname)
      || !/^\/(?:[^/]+\/)+\d{4,}\/?$/.test(url.pathname)) return null
    url.hostname = 'www.starobserver.com.au'
    url.search = ''; url.hash = ''
    return url.href
  } catch { return null }
}

export function parseStarObserverSyndication(xml: string, maxItems: number, now = Date.now()): Record<string, unknown>[] {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<rss(?:\s|>)/i.test(xml)) throw new Error('Star Observer syndication returned an invalid RSS document')
  const seen = new Set<string>()
  const items: Record<string, unknown>[] = []
  for (const item of parseRssItems(xml, false, 40)) {
    if (items.length >= Math.max(0, Math.min(40, maxItems))) break
    const url = publisherArticle(item.url)
    const published = typeof item.published_at === 'string' ? Date.parse(item.published_at) : NaN
    // Search results can contain old archives or pages. Only recent, dated
    // publisher articles are evidence that this ongoing import is healthy.
    if (!url || seen.has(url) || !Number.isFinite(published) || published > now + 86_400_000 || published < now - 31 * 86_400_000) continue
    seen.add(url)
    items.push({ ...item, url, published_at: new Date(published).toISOString(), image_url: null,
      syndication_provider: 'Bing News RSS', syndication_url: STAR_OBSERVER_SYNDICATION,
      content_scope: 'syndicated_excerpt',
    })
  }
  if (!items.length) throw new Error('Star Observer syndication returned no recent valid publisher articles')
  return items
}

export async function fetchStarObserverSyndication(maxItems: number, fetchText: (url: string) => Promise<string>) {
  const xml = await fetchText(STAR_OBSERVER_SYNDICATION)
  return { items: parseStarObserverSyndication(xml, maxItems), bytes: new TextEncoder().encode(xml).byteLength, channelMeta: null }
}
