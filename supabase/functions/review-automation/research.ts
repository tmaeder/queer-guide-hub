import { fetchEvidence, sourceUrl } from './evidence.ts'
import type { Context, Evidence } from './policy.ts'

const MAX_ATTEMPTS = 4
const MAX_EVIDENCE = 2
/** Discover only explicit URLs from the public context; never guess a domain or trust a search snippet. */
export function sourceCandidates(context: Context): string[] {
  const urls = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 2048) return
    try {
      const url = sourceUrl(value)
      url.hash = ''
      urls.add(url.href)
    } catch { /* Invalid/private/HTTP URLs are not destinations. */ }
  }
  for (const url of context.urls) add(url)
  let visited = 0
  const walk = (value: unknown, depth = 0) => {
    if (++visited > 2000 || depth > 6 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const entry of value) walk(entry, depth + 1); return }
    for (const [key, entry] of Object.entries(value)) {
      if (['url', 'source_url', 'website'].includes(key)) add(entry)
      else if (key === 'urls' && Array.isArray(entry)) { for (const url of entry.slice(0, 4)) add(url) }
      else if (entry && typeof entry === 'object') walk(entry, depth + 1)
    }
  }
  // These are service-projected public fields. Do not crawl item metadata, raw payloads or free text.
  for (const value of [context.record, context.proposal, context.related, context.research]) walk(value)
  return [...urls].slice(0, MAX_ATTEMPTS)
}

/** Direct, bounded retrieval has no search-provider or API-key dependency. Stored captures are not live evidence. */
export async function recoverSources(context: Context, fetcher: typeof fetch = fetch): Promise<{ evidence: Evidence[]; errors: string[]; attempted: number }> {
  const evidence: Evidence[] = [], errors: string[] = []
  const urls = sourceCandidates(context)
  let attempted = 0
  for (const url of urls) {
    attempted++
    try { evidence.push(await fetchEvidence(url, fetcher)) }
    catch (error) { errors.push(error instanceof Error ? error.message : 'Source fetch failed') }
    if (evidence.length === MAX_EVIDENCE) break
  }
  return { evidence, errors, attempted }
}
