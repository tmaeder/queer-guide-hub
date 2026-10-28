import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import type { Context, Evidence } from './policy.ts'
/** Search recovers missing source URLs; snippets alone are never accepted as evidence. */
export async function recoverSources(context: Context): Promise<Evidence[]> {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) throw new Error('Source recovery is not configured')
  const name = String(context.record?.name ?? context.record?.title ?? context.item.title).slice(0, 180)
  const place = context.related.location as { city?: string; country?: string } | undefined
  const response = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(18000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: [name, place?.city, place?.country, 'official'].filter(Boolean).join(' '), limit: 2, sources: ['web'],
      scrapeOptions: { formats: ['markdown'], onlyMainContent: true, maxAge: 0, timeout: 12000 } }),
  })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Source recovery HTTP ${response.status}`) }
  const body = await response.json() as { success?: boolean; data?: { web?: { url?: string; markdown?: string }[] } }
  if (body.success === false) throw new Error('Source recovery failed')
  const evidence: Evidence[] = []
  for (const item of body.data?.web ?? []) {
    if (typeof item.url !== 'string' || typeof item.markdown !== 'string' || item.markdown.length < 100) continue
    try { assertPublicHttpUrl(item.url) } catch { continue }
    evidence.push({ url: item.url, text: item.markdown.slice(0, 18000), retrieved_at: new Date().toISOString() })
    if (evidence.length === 2) break
  }
  return evidence
}
