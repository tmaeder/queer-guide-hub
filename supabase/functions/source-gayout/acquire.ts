import { fetchGayOutDocument, GayOutFetchError } from '../_shared/gayout-fetch.ts'
import type { GayOutDocument } from '../_shared/gayout-fetch.ts'
import { extractGayOutDocument } from './extract.ts'

/** Keep acquisition local to this importer; preserve other live importer runtimes. */
export async function acquireGayOutDocument(
  url: string, sitemap: boolean, getEnv: (name: string) => string | undefined, fetcher: typeof fetch = fetch,
): Promise<Omit<GayOutDocument, 'method'> & { method: GayOutDocument['method'] | 'extract' }> {
  try { return await fetchGayOutDocument(url, { sitemap, fetcher }) }
  catch (failure) {
    if (!(failure instanceof GayOutFetchError) || failure.code !== 'E_GAYOUT_SOURCE_BLOCKED') throw failure
  }
  const extracted = await extractGayOutDocument(url, sitemap, getEnv, fetcher)
  if (extracted) return { html: extracted.html, method: 'extract' }
  if (getEnv('GAYOUT_USE_FIRECRAWL') === 'true')
    return fetchGayOutDocument(url, { sitemap, fetcher, firecrawlApiKey: getEnv('FIRECRAWL_API_KEY') })
  throw new GayOutFetchError('E_GAYOUT_SOURCE_BLOCKED', 'Direct fetch and internal extraction returned no usable GayOut document. Verify EXTRACT_WORKER_URL and EXTRACT_WORKER_SECRET and publisher access. Firecrawl fallback is disabled.', 3600)
}
