import { MissingCredentialsError, InvalidCredentialsError } from '../_shared/source-adapter.ts'
import { parseCsv } from '../_shared/csv.ts'

function downloadUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new MissingCredentialsError('AWIN_FEED_URL') }
  if (url.protocol !== 'https:' || url.username || url.password ||
    !['productdata.awin.com', 'datafeed.api.productserve.com'].includes(url.hostname))
    throw new MissingCredentialsError('AWIN_FEED_URL')
  return url.toString()
}

/** Product-feed credentials are distinct from Awin's Publisher API token. */
export async function resolveAwinFeedUrl(
  configured: string | undefined,
  getEnv: (name: string) => string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const explicit = configured || getEnv('AWIN_FEED_URL')
  if (explicit) return downloadUrl(explicit)
  const token = getEnv('AWIN_DATAFEED_API_KEY')
  if (!token) throw new MissingCredentialsError('AWIN_DATAFEED_API_KEY')
  const advertiser = getEnv('AWIN_ADVERTISER_ID')
  if (!advertiser) throw new MissingCredentialsError('AWIN_ADVERTISER_ID')
  const response = await fetcher(`https://productdata.awin.com/datafeed/list/apikey/${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(20000),
  })
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel()
    throw new InvalidCredentialsError('AWIN_DATAFEED_API_KEY', response.status)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`AWIN feed inventory HTTP ${response.status}`)
  }
  const rows = parseCsv(await response.text()).map(row => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), value]),
  ))
  const candidates = rows.filter(row => String(row.advertiserid) === advertiser && /^(en|english)$/i.test(String(row.language || '')))
  if (candidates.length !== 1) throw new MissingCredentialsError('AWIN_FEED_URL')
  return downloadUrl(String(candidates[0].url || candidates[0].downloadurl || ''))
}
