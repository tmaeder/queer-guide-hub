import { firecrawlPage, firecrawlScrape } from './firecrawl.ts'

// These public publisher endpoints were verified through the basic proxy.
// Never send arbitrary source URLs or private/tokenized feeds to this service.
export function publicSourceProxyAllowed(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return false
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'travelgay.com') return url.pathname === '/gay-pride-calendar'
    return ['qvoicenews.com', 'lavendermagazine.com', 'losangelesblade.com'].includes(host)
      && /^\/feed\/?$/.test(url.pathname)
  } catch { return false }
}

export async function fetchPublicSourceThroughProxy(
  url: string,
  apiKey: string,
  readText: (response: Response) => Promise<string>,
  signal = AbortSignal.timeout(25_000),
): Promise<string> {
  if (!publicSourceProxyAllowed(url)) throw new Error('Unsupported public-source proxy endpoint')
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not configured')
  const response = await firecrawlScrape(apiKey, { url, formats: ['rawHtml'], onlyMainContent: false, proxy: 'basic', maxAge: 3_600_000 }, { signal })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Public-source proxy HTTP ${response.status}${response.status === 402 ? ': Firecrawl credits exhausted' : ''}`)
  }
  const page = firecrawlPage(JSON.parse(await readText(response)))
  if (page.statusCode && page.statusCode >= 400) throw new Error(`Publisher returned HTTP ${page.statusCode} through the public-source proxy`)
  const html = page.rawHtml
  if (!page.success || typeof html !== 'string' || !html.trim()) throw new Error('Public-source proxy returned no source document')
  return html
}
