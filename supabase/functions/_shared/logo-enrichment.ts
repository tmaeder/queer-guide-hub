/**
 * logo.dev enrichment utilities.
 * Extracts domains from website URLs and builds logo.dev CDN URLs.
 */

const LOGO_DEV_API_KEY = Deno.env.get('LOGO_DEV_API_KEY') || ''

/**
 * Extract the bare domain from a URL string.
 * Returns null if the URL is invalid or has no useful domain.
 */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  try {
    // Add protocol if missing
    const withProtocol = trimmed.match(/^https?:\/\//) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withProtocol)
    const hostname = parsed.hostname.toLowerCase()

    // Skip IP addresses, localhost, empty
    if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return null
    }

    // Remove www. prefix
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Use `fallback=404` so missing logos return HTTP 404. The caller stores a URL
 * for the mirrored image, keeping this tokenized URL private.
 */
function buildLogoProbeUrl(domain: string): string | null {
  if (!LOGO_DEV_API_KEY || !domain) return null
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_API_KEY}&size=128&format=png&fallback=404`
}

interface FetchedLogo {
  bytes: Uint8Array
  contentType: string
}

/**
 * The batch distinguishes a missing brand from upstream failures so it can
 * mark the former as attempted and retry the latter.
 */
export type LogoProbeOutcome =
  | 'found'
  | 'not_indexed' // 404 with fallback=404 — logo.dev genuinely has no logo
  | 'unauthorized' // 401/403 — the token is missing, wrong or expired
  | 'rate_limited' // 429
  | 'unconfigured' // no LOGO_DEV_API_KEY, or no usable domain in the website
  | 'error' // 5xx, network failure, or a 200 too small to be an image

interface LogoProbe {
  outcome: LogoProbeOutcome
  logo: FetchedLogo | null
  status?: number
}

/**
 * Probe logo.dev for a website's REAL logo, reporting WHY when there isn't one.
 *
 * `fallback=404` is what makes a 200 trustworthy: without it logo.dev answers
 * every domain with a generic first-letter monogram, which under the logo-first
 * display rule would mask a venue's own photos.
 */
export async function probeRealLogo(website: string | null | undefined): Promise<LogoProbe> {
  const probeUrl = buildLogoProbeUrl(extractDomain(website) ?? '')
  if (!probeUrl) return { outcome: 'unconfigured', logo: null }
  try {
    const res = await fetch(probeUrl, { method: 'GET' })
    if (res.status === 404) return { outcome: 'not_indexed', logo: null, status: 404 }
    if (res.status === 401 || res.status === 403)
      return { outcome: 'unauthorized', logo: null, status: res.status }
    if (res.status === 429) return { outcome: 'rate_limited', logo: null, status: 429 }
    if (!res.ok) return { outcome: 'error', logo: null, status: res.status }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < 100) return { outcome: 'error', logo: null, status: res.status }
    const contentType = res.headers.get('content-type') || 'image/png'
    return { outcome: 'found', logo: { bytes, contentType }, status: res.status }
  } catch {
    return { outcome: 'error', logo: null }
  }
}

/** Small delay helper for rate limiting in batch operations */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
