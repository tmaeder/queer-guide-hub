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
 * Check if a logo.dev URL actually returns an image (HEAD request).
 * Returns the URL if valid, null if 404 or error.
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
 * Resolve a logo URL from a website, with optional HEAD verification.
 */
export async function resolveLogoUrl(
  website: string | null | undefined,
  verify = false,
): Promise<string | null> {
  const url = logoUrlFromWebsite(website)
  if (!url) return null
  if (!verify) return url
  return verifyLogoUrl(url)
}

/** Small delay helper for rate limiting in batch operations */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
