import { gayOutPublicUrl, isGayOutChallenge } from '../_shared/gayout-source.ts'
import { GayOutFetchError } from '../_shared/gayout-fetch.ts'

/** Reuse our authenticated Cloudflare worker; no external scraping-provider key. */
export async function extractGayOutDocument(
  url: string, sitemap: boolean, getEnv: (name: string) => string | undefined, fetcher: typeof fetch = fetch,
): Promise<{ html: string; finalUrl: string } | null> {
  const target = gayOutPublicUrl(url)
  const base = getEnv('EXTRACT_WORKER_URL'), secret = getEnv('EXTRACT_WORKER_SECRET') ?? getEnv('INTERNAL_INVOKE_SECRET')
  if (!target) return null
  if (!base || !secret) throw new GayOutFetchError('E_GAYOUT_EXTRACT_CONFIG', 'Configure EXTRACT_WORKER_URL and EXTRACT_WORKER_SECRET for internal extraction', 3600)
  const worker = new URL(base)
  if (worker.protocol !== 'https:' || worker.username || worker.password || worker.port ||
    !(worker.hostname === 'extract.queer.guide' || worker.hostname.endsWith('.workers.dev'))) throw Error('Invalid internal extraction worker URL')
  for (const render of [false, true]) {
    try {
      const response = await fetcher(`${worker.origin}/extract`, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
        body: JSON.stringify({ url: target.toString(), raw: true, render }), signal: AbortSignal.timeout(render ? 22000 : 12000) })
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel()
        throw new GayOutFetchError('E_GAYOUT_EXTRACT_AUTH', 'Internal extraction rejected EXTRACT_WORKER_SECRET; it must match the extraction worker INTERNAL_SECRET', 3600)
      }
      if (!response.ok) { await response.body?.cancel(); continue }
      if (!response.body) continue
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
      try {
        for (;;) { const part = await reader.read(); if (part.done) break
          size += part.value.byteLength; if (size > 8_000_000) throw Error('Extraction result exceeds the byte limit'); chunks.push(part.value) }
      } finally { await reader.cancel() }
      const bytes = new Uint8Array(size); let offset = 0
      for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
      const data = JSON.parse(new TextDecoder().decode(bytes))
      const final = typeof data.finalUrl === 'string' ? gayOutPublicUrl(data.finalUrl) : null
      if (!final || final.pathname !== target.pathname || typeof data.rawHtml !== 'string' || isGayOutChallenge(data.rawHtml)) continue
      const html: string = data.rawHtml
      if (sitemap ? !/<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(html) : !/<script[^>]*application\/ld\+json/i.test(html)) continue
      return { html, finalUrl: final.toString() }
    } catch (error) {
      if (error instanceof GayOutFetchError) throw error
      // One bounded browser attempt follows an ordinary fetch failure.
    }
  }
  return null
}
