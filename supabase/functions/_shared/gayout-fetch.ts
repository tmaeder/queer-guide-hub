import { gayOutPublicUrl, isGayOutChallenge } from './gayout-source.ts'
import { firecrawlPage, firecrawlScrape } from './firecrawl.ts'

export class GayOutFetchError extends Error {
  constructor(readonly code: string, message: string, readonly retryAfterSeconds = 60) {
    super(`${code}: ${message}`); this.name = 'GayOutFetchError'
  }
}
export interface GayOutDocument {
  html?: string
  jsonLd?: unknown[]
  sourceText?: string
  method: 'http' | 'render' | 'firecrawl'
}
interface Options {
  sitemap: boolean
  firecrawlApiKey?: string
  fetcher?: typeof fetch
  render?: (url: string) => Promise<{ jsonLd?: unknown[]; markdown?: string; meta?: { title?: string | null }; finalUrl?: string } | null>
}
async function boundedText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let bytes = 0, result = ''
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 25_000_000) throw new GayOutFetchError('E_GAYOUT_DOCUMENT_TOO_LARGE', 'source response exceeds the 25 MB safety limit')
      result += decoder.decode(part.value, { stream: true })
    }
    return result + decoder.decode()
  } finally { await reader.cancel().catch(() => undefined) }
}
function retryAfter(response: Response): number {
  const v = response.headers.get('retry-after') || ''
  const seconds = /^\d+$/.test(v) ? Number(v) : Math.ceil((Date.parse(v) - Date.now()) / 1000)
  return Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 86400)) : 60
}
/** No proxy rotation or challenge solving: ordinary fetch, the existing renderer,
 * then the configured Firecrawl account. Blocked responses are explicit errors. */
export async function fetchGayOutDocument(url: string, options: Options): Promise<GayOutDocument> {
  const original = gayOutPublicUrl(url)
  if (!original) throw new GayOutFetchError('E_GAYOUT_URL_INVALID', 'only HTTPS GayOut source URLs are permitted')
  const request = options.fetcher || fetch, reasons: string[] = []
  let current = original.toString()
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await request(current, { redirect: 'manual',
        headers: { 'User-Agent': 'QueerGuideSync/1.0 (+https://queer.guide)', Accept: options.sitemap ? 'application/xml,text/xml' : 'text/html' },
        signal: AbortSignal.timeout(10000) })
      if (response.status >= 300 && response.status < 400) {
        const destination = gayOutPublicUrl(new URL(response.headers.get('location') || '', current).toString())
        await response.body?.cancel()
        if (!destination) throw new GayOutFetchError('E_GAYOUT_REDIRECT_BLOCKED', 'source redirected outside GayOut')
        current = destination.toString(); continue
      }
      if ([404, 410].includes(response.status)) { await response.body?.cancel(); throw new GayOutFetchError('E_GAYOUT_SOURCE_GONE', `source returned HTTP ${response.status}`) }
      if (response.status === 429) { const delay = retryAfter(response); await response.body?.cancel(); throw new GayOutFetchError('E_GAYOUT_RATE_LIMIT', 'source rate limit; retry is delayed', delay) }
      if (!response.ok) { await response.body?.cancel(); reasons.push(`HTTP source returned ${response.status}`); break }
      const html = await boundedText(response)
      if (html && !isGayOutChallenge(html)) return { html, method: 'http' }
      reasons.push('HTTP source returned a security challenge'); break
    }
  } catch (error) {
    if (error instanceof GayOutFetchError && ['E_GAYOUT_SOURCE_GONE', 'E_GAYOUT_RATE_LIMIT', 'E_GAYOUT_REDIRECT_BLOCKED', 'E_GAYOUT_DOCUMENT_TOO_LARGE'].includes(error.code)) throw error
    reasons.push('HTTP source unavailable')
  }
  if (!options.sitemap && options.render) {
    try {
      const rendered = await options.render(original.toString())
      if (rendered && (!rendered.finalUrl || gayOutPublicUrl(rendered.finalUrl)) &&
        !isGayOutChallenge(rendered.markdown || '', rendered.meta?.title || '') && rendered.jsonLd?.length) {
        return { jsonLd: rendered.jsonLd, sourceText: rendered.markdown, method: 'render' }
      }
      reasons.push('renderer returned no factual structured data')
    } catch { reasons.push('renderer unavailable') }
  }
  if (options.firecrawlApiKey) {
    let response: Response
    try {
      response = await firecrawlScrape(options.firecrawlApiKey, { url: original.toString(), formats: ['rawHtml'], onlyMainContent: false, timeout: 35000 },
        { signal: AbortSignal.timeout(45000), fetcher: request })
    } catch { throw new GayOutFetchError('E_GAYOUT_SOURCE_UNAVAILABLE', [...reasons, 'Firecrawl request failed'].join('; ')) }
    if (response.status === 402) { await response.body?.cancel(); throw new GayOutFetchError('E_GAYOUT_PROVIDER_QUOTA', 'configured Firecrawl account has no available credits', 3600) }
    if (response.status === 429) { const delay = retryAfter(response); await response.body?.cancel(); throw new GayOutFetchError('E_GAYOUT_RATE_LIMIT', 'Firecrawl rate limit; retry is delayed', delay) }
    if (!response.ok) { const status = response.status; await response.body?.cancel(); throw new GayOutFetchError('E_GAYOUT_PROVIDER_UNAVAILABLE', `Firecrawl returned HTTP ${status}`) }
    const body = JSON.parse(await boundedText(response)) as { success?: boolean }
    const page = firecrawlPage(body), html = page.rawHtml
    if (body.success === true && html && (page.statusCode || 200) < 400 &&
      (!page.url || gayOutPublicUrl(page.url)) && !isGayOutChallenge(html)) return { html, method: 'firecrawl' }
    reasons.push('Firecrawl returned no usable source document')
  } else reasons.push('Firecrawl backend key is not configured')
  throw new GayOutFetchError('E_GAYOUT_SOURCE_BLOCKED', reasons.join('; '), 3600)
}
