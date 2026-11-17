// These public publisher endpoints were verified through the basic proxy.
// Never send arbitrary source URLs or private/tokenized feeds to this service.
export function publicSourceProxyAllowed(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return false
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'travelgay.com') return url.pathname === '/gay-pride-calendar'
    return ['starobserver.com.au', 'qvoicenews.com', 'lavendermagazine.com', 'losangelesblade.com'].includes(host)
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
  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ['rawHtml'], onlyMainContent: false, proxy: 'basic', maxAge: 3_600_000 }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Public-source proxy HTTP ${response.status}${response.status === 402 ? ': Firecrawl credits exhausted' : ''}`)
  }
  const payload = JSON.parse(await readText(response)) as { success?: boolean; data?: { rawHtml?: string; metadata?: { statusCode?: number } } }
  const status = payload.data?.metadata?.statusCode
  if (status && status >= 400) throw new Error(`Publisher returned HTTP ${status} through the public-source proxy`)
  const html = payload.data?.rawHtml
  if (payload.success === false || typeof html !== 'string' || !html.trim()) throw new Error('Public-source proxy returned no source document')
  return html
}
