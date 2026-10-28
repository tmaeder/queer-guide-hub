import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import type { Evidence } from './policy.ts'
export function sourceUrl(raw: string): URL {
  const url = assertPublicHttpUrl(raw)
  const hasCredentials = Boolean(url.username) || Boolean(url.password)
  const allowedPort = !url.port || url.port === '443'
  if (url.protocol !== 'https:' || hasCredentials || !allowedPort) throw new Error('Unsupported source URL')
  return url
}
/** Bound memory, redirects, response time and destinations; source text never becomes instructions. */
export async function fetchEvidence(raw: string, fetcher: typeof fetch = fetch): Promise<Evidence> {
  let url = sourceUrl(raw)
  const signal = AbortSignal.timeout(12000)
  for (let n = 0; n < 4; n++) {
    const response = await fetcher(url, { redirect: 'manual', signal, headers: { Accept: 'text/html,text/plain,application/json', 'User-Agent': 'QueerGuide-ReviewAutomation/1.0 (https://queer.guide)' } })
    if (response.status >= 300 && response.status < 400) {
      const target = response.headers.get('location'); await response.body?.cancel()
      if (!target) throw new Error('Source redirect has no location')
      url = sourceUrl(new URL(target, url).href)
      continue
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Source HTTP ${response.status}`) }
    const type = response.headers.get('content-type') ?? ''
    if (!/text\/|application\/(?:json|ld\+json)/i.test(type)) { await response.body?.cancel(); throw new Error('Source requires visual or non-text research') }
    if (!response.body) throw new Error('Empty source')
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = ''; let bytes = 0
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 524288) throw new Error('Source exceeds 512 KiB limit'); text += decoder.decode(part.value, { stream: true }) } text += decoder.decode() }
    finally { await reader.cancel().catch(() => {}) }
    text = text.replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 18000)
    if (text.length < 100) throw new Error('Source has insufficient readable text')
    return { url: url.href, retrieved_at: new Date().toISOString(), text }
  }
  throw new Error('Too many source redirects')
}
