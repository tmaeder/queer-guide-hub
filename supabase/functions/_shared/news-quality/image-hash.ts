// Image URL hashing for duplicate detection.
// We hash the *canonicalised* URL (not the bytes) — fast, free, and catches
// the most common duplicate case: wire-service images reposted across feeds
// (Reuters/AP photos, stock galleries, etc). True perceptual hashing for
// resized/recompressed copies is v3 territory.

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_brand', 'utm_referrer',
  'ref', 'referrer', 'source', 'src',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid',
  'amp', '_t', '_', 'cb', 'cache', 'v', 'ver',
  'w', 'h', 'width', 'height', 'size', 'resize', 'fit', 'q', 'quality',
])

/**
 * Strip tracking + cache-busting params, lowercase host, drop fragment.
 * Preserves the path (incl. trailing /) and any param the CDN actually keys on.
 * Idempotent — safe to call repeatedly.
 */
export function canonicaliseImageUrl(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!/^https?:\/\//i.test(s)) return null
  try {
    const u = new URL(s)
    u.hash = ''
    u.hostname = u.hostname.toLowerCase()
    if (u.protocol === 'http:' && (u.port === '80' || !u.port)) u.port = ''
    if (u.protocol === 'https:' && (u.port === '443' || !u.port)) u.port = ''
    // Some CDNs put resize params in the path itself (e.g. /image-1024x768.jpg)
    // — leave those alone; we only normalise query params.
    const keep: [string, string][] = []
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.push([k, v])
    }
    keep.sort(([a], [b]) => a.localeCompare(b))
    u.search = keep.length ? '?' + keep.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : ''
    return u.toString()
  } catch {
    return null
  }
}

/** SHA-256 of the canonicalised URL, hex. Returns null for invalid input. */
export async function hashImageUrl(rawUrl: string): Promise<string | null> {
  const canon = canonicaliseImageUrl(rawUrl)
  if (!canon) return null
  const data = new TextEncoder().encode(canon)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
