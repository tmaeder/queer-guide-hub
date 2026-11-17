// Only the four verified official publisher feeds use the existing proxy.
// Ordinary feeds retain their direct path; no discovery or URL rewriting occurs.
const PUBLISHERS = new Set(['lavendermagazine.com', 'www.losangelesblade.com', 'qvoicenews.com', 'www.starobserver.com.au'])
export function isProxyPublisherFeed(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && PUBLISHERS.has(url.hostname) && url.pathname === '/feed/'
  } catch { return false }
}
const MAX_PROXY_BYTES = 2_000_000
export async function fetchPublisherRss(url: string, key: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  if (!isProxyPublisherFeed(url)) throw new Error('Publisher feed proxy is not enabled for this URL')
  if (!key) throw new Error('Publisher feed proxy credential is not configured')
  const response = await fetcher('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST', signal, redirect: 'error',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['rawHtml'], onlyMainContent: false, proxy: 'basic', maxAge: 900_000, timeout: 15_000 }),
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error(`Publisher feed proxy HTTP ${response.status}`)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PROXY_BYTES) throw new Error('Publisher feed proxy response exceeds the byte budget')
      chunks.push(value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const result = JSON.parse(new TextDecoder().decode(bytes))
  const xml = result.data?.rawHtml
  if (result.success !== true || result.data?.metadata?.statusCode >= 400 || typeof xml !== 'string' || !/<(?:rss|feed)(?:\s|>)/i.test(xml) || /<!doctype\s+html/i.test(xml)) {
    throw new Error('Publisher feed proxy did not return a successful RSS or Atom document')
  }
  return xml
}
export function manualFeedSourceIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.length || value.length > 30 || value.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw new Error('source_ids must contain between 1 and 30 source UUIDs')
  return [...new Set(value as string[])]
}
