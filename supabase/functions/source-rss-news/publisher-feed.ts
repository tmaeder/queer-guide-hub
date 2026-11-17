// Exact public publisher URLs only. The reader returns original XML/HTML,
// rather than summaries, so the ordinary source parsers retain attribution.
const FEEDS: Record<string, string> = {
  'lavendermagazine.com': '/feed/', 'www.losangelesblade.com': '/feed/',
  'qvoicenews.com': '/feed/', 'www.starobserver.com.au': '/feed/',
  'thebicast.hendersonclark.us': '/feed/podcast',
}
export function isProxyPublisherFeed(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && FEEDS[url.hostname] === url.pathname
  } catch { return false }
}
export interface PublisherProxyOptions { workerUrl?: string; workerSecret?: string }
async function boundedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Publisher document exceeds the byte budget')
      chunks.push(value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}
function readableDocument(url: string, text: string): boolean {
  if (isProxyPublisherFeed(url)) return /^\s*(?:<\?xml[^>]*>\s*)?(?:<\?xml-stylesheet[^>]*>\s*)?<(?:rss|feed)(?:\s|>)/i.test(text)
  return /<script[^>]*application\/ld\+json/i.test(text) && !/<title>\s*Just a moment/i.test(text)
}
export async function fetchPublisherDocument(url: string, signal: AbortSignal, options: PublisherProxyOptions = {}, fetcher: typeof fetch = fetch): Promise<string> {
  if (!isProxyPublisherFeed(url) && url !== 'https://www.travelgay.com/gay-pride-calendar') throw new Error('Publisher proxy is not enabled for this URL')
  let failure: Error
  try {
    const response = await fetcher(`https://r.jina.ai/${url}`, { signal, redirect: 'error', headers: { 'X-Return-Format': 'html', Accept: 'text/plain' } })
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Publisher reader HTTP ${response.status}`) }
    const text = await boundedText(response, 1_000_000)
    if (!readableDocument(url, text)) throw new Error('Publisher reader returned a challenge or an unexpected document')
    return text
  } catch (error) { failure = error as Error }
  if (!options.workerUrl || !options.workerSecret) throw failure
  const worker = new URL(options.workerUrl)
  if (worker.protocol !== 'https:' || worker.username || worker.password || !(worker.hostname === 'extract.queer.guide' || worker.hostname.endsWith('.workers.dev'))) throw new Error('Invalid internal publisher extraction URL')
  for (const render of [false, true]) {
    try {
      const response = await fetcher(`${worker.origin}/extract`, { method: 'POST', signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': options.workerSecret }, body: JSON.stringify({ url: render ? url : `https://r.jina.ai/${url}`, raw: true, render }) })
      if (!response.ok) { const details = await boundedText(response, 4096); throw new Error(`Publisher extraction HTTP ${response.status}: ${details.slice(0, 300)}`) }
      const result = JSON.parse(await boundedText(response, 2_000_000))
      if (typeof result.rawHtml !== 'string' || !readableDocument(url, result.rawHtml)) throw new Error(`Publisher extraction returned a challenge or an unexpected document (${render ? 'render' : 'fetch'})`)
      return result.rawHtml
    } catch (error) { failure = new Error(`${failure.message}; ${(error as Error).message}`) }
  }
  throw failure
}
export async function fetchPublisherRss(url: string, signal: AbortSignal, options: PublisherProxyOptions = {}, fetcher: typeof fetch = fetch): Promise<string> {
  if (!isProxyPublisherFeed(url)) throw new Error('Publisher feed proxy is not enabled for this URL')
  return fetchPublisherDocument(url, signal, options, fetcher)
}
export function manualFeedSourceIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.length || value.length > 30 || value.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw new Error('source_ids must contain between 1 and 30 source UUIDs')
  return [...new Set(value as string[])]
}
