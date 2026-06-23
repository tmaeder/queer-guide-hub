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
 * Fetch the REAL logo image bytes for a website, or null when no real logo
 * exists. Probes logo.dev with `fallback=404`, so a 200 body is guaranteed to be
 * an actual brand logo (never the generic monogram). Returned bytes are meant to
 * be mirrored to our own R2/CDN, so the logo.dev token never reaches a public
 * URL. Tiny/empty responses are treated as "no logo".
 */
export async function fetchRealLogo(
  website: string | null | undefined,
): Promise<FetchedLogo | null> {
  const probeUrl = buildLogoProbeUrl(extractDomain(website) ?? '')
  if (!probeUrl) return null
  try {
    const res = await fetch(probeUrl, { method: 'GET' })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < 100) return null // logo.dev sometimes 200s a 1px blank
    const contentType = res.headers.get('content-type') || 'image/png'
    return { bytes, contentType }
  } catch {
    return null
  }
}

/** Small delay helper for rate limiting in batch operations */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
