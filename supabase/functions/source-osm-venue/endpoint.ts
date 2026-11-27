import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter'

/** Provider URLs can contain a private path key: never include them in errors. */
export function overpassEndpoint(configured?: string): string {
  try {
    const url = new URL(configured?.trim() || DEFAULT_ENDPOINT)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('invalid')
    assertPublicHttpUrl(url.href)
    return url.href
  } catch {
    throw new Error('Invalid OVERPASS_API_URL: use a public HTTPS Overpass interpreter endpoint')
  }
}
