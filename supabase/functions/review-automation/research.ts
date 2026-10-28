import { fetchEvidence } from './evidence.ts'
import type { Context, Evidence } from './policy.ts'
import { ProviderError } from './provider.ts'
/** Search recovers missing source URLs; snippets alone are never accepted as evidence. */
export async function recoverSources(context: Context): Promise<Evidence[]> {
  const key = Deno.env.get('FIRECRAWL_API_KEY')
  if (!key) throw new ProviderError('Source recovery configuration', 503)
  const name = String(context.record?.name ?? context.record?.title ?? context.item.title).slice(0, 180)
  const place = context.related.location as { city?: string; country?: string } | undefined
  const response = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(18000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: [name, place?.city, place?.country, 'official'].filter(Boolean).join(' '), limit: 2, sources: ['web'] }),
  })
  if (!response.ok) { await response.body?.cancel(); throw new ProviderError('Source recovery', response.status) }
  const body = await response.json() as { success?: boolean; data?: { web?: { url?: string }[] } }
  if (body.success === false) throw new ProviderError('Source recovery', 503)
  const evidence: Evidence[] = []
  for (const item of body.data?.web ?? []) {
    if (typeof item.url !== 'string') continue
    try { evidence.push(await fetchEvidence(item.url)) } catch { continue }
    if (evidence.length === 2) break
  }
  return evidence
}
