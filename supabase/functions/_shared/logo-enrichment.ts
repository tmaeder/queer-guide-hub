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
 * Build a logo.dev CDN URL for the given domain.
 * Returns null if no API key is configured or domain is empty.
 */
export function buildLogoUrl(domain: string): string | null {
  if (!LOGO_DEV_API_KEY || !domain) return null
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_API_KEY}&size=128&format=png`
}

/**
 * Build a logo URL from a website URL. Combines extractDomain + buildLogoUrl.
 */
export function logoUrlFromWebsite(website: string | null | undefined): string | null {
  const domain = extractDomain(website)
  if (!domain) return null
  return buildLogoUrl(domain)
}

/**
 * Build the *probe* URL for a domain — identical to the stored URL but with
 * `fallback=404`, so logo.dev returns HTTP 404 (instead of a generic
 * first-letter monogram, its 200 default) when it has no real logo for the
 * domain. Used only to decide whether a real logo exists; never stored.
 */
export function buildLogoProbeUrl(domain: string): string | null {
  if (!LOGO_DEV_API_KEY || !domain) return null
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_API_KEY}&size=128&format=png&fallback=404`
}

/**
 * Check if a logo.dev URL actually returns an image (HEAD request).
 * Returns the URL if valid, null if 404 or error.
 *
 * NOTE: this is a plain reachability check. logo.dev serves a 200 monogram by
 * default, so a HEAD on the bare URL passes even when no real logo exists — use
 * {@link resolveLogoUrl} (which probes with `fallback=404`) to gate on a *real*
 * logo.
 */
export async function verifyLogoUrl(logoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(logoUrl, { method: 'HEAD' })
    if (res.ok) return logoUrl
    return null
  } catch {
    return null
  }
}

/**
 * Resolve a logo URL from a website.
 *
 * With `verify` (the default) we only return a URL when the domain has a *real*
 * brand logo — probed via `fallback=404`. This deliberately rejects logo.dev's
 * monogram fallback: under the logo-first display rule a monogram `logo_url`
 * would mask the venue's own photos, which is usually a downgrade. Domains
 * without a real logo resolve to null (the caller still marks them attempted, so
 * they aren't retried). Pass `verify = false` to skip the network probe and
 * return the unverified URL (monogram included).
 */
export async function resolveLogoUrl(
  website: string | null | undefined,
  verify = true,
): Promise<string | null> {
  const storeUrl = logoUrlFromWebsite(website)
  if (!storeUrl) return null
  if (!verify) return storeUrl

  const probeUrl = buildLogoProbeUrl(extractDomain(website) ?? '')
  if (!probeUrl) return null
  try {
    // GET (not HEAD) so the 404 fallback status is reliably reflected.
    const res = await fetch(probeUrl, { method: 'GET' })
    return res.ok ? storeUrl : null
  } catch {
    return null
  }
}

export interface FetchedLogo {
  bytes: Uint8Array
  contentType: string
}

/**
 * Outcome of one logo.dev probe. The OUTCOME is the point: `fetchRealLogo`
 * collapsed every non-200 into null, so an expired token, a rate limit and a
 * genuine "we don't have this brand" were indistinguishable — all three read as
 * "no logo exists", the batch stamped the row attempted, and the run reported
 * success. A caller that cannot tell those apart cannot notice its upstream has
 * died.
 */
export type LogoProbeOutcome =
  | 'found'
  | 'not_indexed' // 404 with fallback=404 — logo.dev genuinely has no logo
  | 'unauthorized' // 401/403 — the token is missing, wrong or expired
  | 'rate_limited' // 429
  | 'unconfigured' // no LOGO_DEV_API_KEY, or no usable domain in the website
  | 'error' // 5xx, network failure, or a 200 too small to be an image

export interface LogoProbe {
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

/** Bytes-or-null wrapper over {@link probeRealLogo}, for callers that only act on a hit. */
export async function fetchRealLogo(
  website: string | null | undefined,
): Promise<FetchedLogo | null> {
  return (await probeRealLogo(website)).logo
}

/** Small delay helper for rate limiting in batch operations */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
