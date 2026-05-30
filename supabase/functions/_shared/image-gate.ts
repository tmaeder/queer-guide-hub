/**
 * Cheap, synchronous, no-network image gate for the staging pipeline.
 *
 * Runs over a staging row's `normalized_data.images[]` and drops entries that
 * can never be a good cover — logos, data URIs, SVGs, sprites, tracking pixels,
 * ad creatives — purely from the URL. The kept list (de-duplicated, order
 * preserved) replaces `images[]` before commit; the dropped list is recorded in
 * `enriched_data.image_gate` for audit. Network-dependent checks (dimensions,
 * solid-colour) live in the image probe / ingest worker, not here.
 */

export interface ImageGateResult {
  kept: string[]
  dropped: { url: string; reason: string }[]
}

/** Logo/brand-mark CDNs — never a content photo, belong in `logo_url`. */
const LOGO_HOSTS = ['logo.dev', 'logo.clearbit.com', 'clearbit.com']

/** High-signal path/host substrings that mark non-content imagery. */
const URL_REJECT_TOKENS = [
  'logo', 'sprite', 'favicon', 'placeholder', 'avatar', 'spacer',
  '1x1', 'tracking-pixel', 'doubleclick', '/ads/', 'advertisement',
]

function isLogoHost(host: string): boolean {
  return LOGO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}

export function gateImages(images: unknown): ImageGateResult {
  const kept: string[] = []
  const dropped: { url: string; reason: string }[] = []
  const arr = Array.isArray(images) ? images : []
  const seen = new Set<string>()

  for (const raw of arr) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const url = raw.trim()

    if (seen.has(url)) { dropped.push({ url, reason: 'duplicate' }); continue }
    seen.add(url)

    if (url.startsWith('data:')) { dropped.push({ url, reason: 'data_uri' }); continue }

    let parsed: URL
    try { parsed = new URL(url) } catch { dropped.push({ url, reason: 'invalid_url' }); continue }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      dropped.push({ url, reason: 'non_http' }); continue
    }

    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()

    if (path.endsWith('.svg')) { dropped.push({ url, reason: 'svg' }); continue }
    if (isLogoHost(host)) { dropped.push({ url, reason: 'logo_host' }); continue }

    const haystack = host + path
    const tokenHit = URL_REJECT_TOKENS.find((t) => haystack.includes(t))
    if (tokenHit) { dropped.push({ url, reason: `token:${tokenHit}` }); continue }

    kept.push(url)
  }

  return { kept, dropped }
}

/** True when a single URL is a logo-CDN image (used for role demotion). */
export function isLogoUrl(url: string): boolean {
  try {
    return isLogoHost(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}
