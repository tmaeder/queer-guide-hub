import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { cleanText, excerptOf } from './rss-parse.ts'

export function isHuffPostQueerFeed(raw: string): boolean {
  const url = new URL(raw)
  return (['www.huffpost.com', 'huffpost.com'].includes(url.hostname) && /^\/(?:section|voices)\/queer-voices\/feed\/?$/.test(url.pathname))
    || (url.hostname === 'chaski.huffpost.com' && url.pathname === '/us/auto/vertical/queer-voices')
}

export function huffPostSectionLinks(html: string, limit: number): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()
  // The top-ad recirculation feed contains unrelated stories. Only the
  // publisher's main section feed is evidence for this registered source.
  $('a.card__headline[data-vars-unit-name="main"][data-vars-subunit-name="zone_feed"]').each((_, el) => {
    if (urls.size >= limit) return false
    try {
      const url = new URL($(el).attr('href') || '')
      if (url.origin === 'https://www.huffpost.com' && !url.username && !url.password && url.pathname.startsWith('/entry/')) {
        url.search = ''; url.hash = ''; urls.add(url.href)
      }
    } catch { /* malformed link */ }
  })
  return [...urls]
}

export function parseHuffPostArticle(html: string, pageUrl: string): Record<string, unknown> | null {
  const $ = cheerio.load(html)
  const pending: unknown[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try { pending.push(JSON.parse($(el).text())) } catch { /* incomplete schema */ }
  })
  for (let n = 0; pending.length && n < 100; n++) {
    const node = pending.shift()
    if (Array.isArray(node)) { pending.push(...node.slice(0, 50)); continue }
    if (!node || typeof node !== 'object') continue
    const value = node as Record<string, unknown>
    if (value['@graph']) pending.push(value['@graph'])
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
    if (!types.some(type => type === 'NewsArticle' || type === 'Article')) continue
    if (typeof value.headline !== 'string' || typeof value.datePublished !== 'string' || !Number.isFinite(Date.parse(value.datePublished))) continue
    const description = typeof value.description === 'string' ? cleanText(value.description) : ''
    const author = Array.isArray(value.author) ? value.author[0] : value.author
    const name = typeof author === 'string' ? author : author && typeof author === 'object' && 'name' in author ? author.name : null
    const image = Array.isArray(value.image) ? value.image[0] : value.image
    return {
      title: cleanText(value.headline), url: pageUrl, published_at: value.datePublished,
      content: description, excerpt: excerptOf(description), author: name, original_author: name,
      image_url: typeof image === 'string' ? image : image && typeof image === 'object' && 'url' in image ? image.url : null,
    }
  }
  return null
}

export async function fetchHuffPostQueerSection(maxItems: number, fetchText: (url: string) => Promise<string>) {
  const section = await fetchText('https://www.huffpost.com/section/queer-voices')
  const items: Record<string, unknown>[] = []
  let bytes = section.length
  for (const url of huffPostSectionLinks(section, Math.max(0, Math.min(3, maxItems)))) {
    try {
      const html = await fetchText(url)
      bytes += html.length
      const item = parseHuffPostArticle(html, url)
      if (item) items.push(item)
    } catch (error) { console.warn(`HuffPost article unavailable: ${(error as Error).message}`) }
  }
  return { items, bytes }
}
