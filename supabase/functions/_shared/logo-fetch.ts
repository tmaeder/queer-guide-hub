/**
 * Fetch a logo image from a third-party URL so it can be mirrored to R2.
 *
 * Used by `marketplace-brand-logo-mirror` for marketplace_brands rows
 * whose logo was written as a hotlink. The result is classified so the caller
 * can tell "never going to work" (stamp it, stop retrying) from "try again
 * later" (stamp nothing):
 *
 *   permanent — a 4xx other than 408/429, a body that is not an acceptable
 *               image, an oversized body, or a URL that is not http(s)
 *   transient — 408/429/5xx, timeout, network error
 *
 * An SVG is returned as-is with contentType image/svg+xml. It must NOT be
 * uploaded like that — on img.queer.guide it is a script-capable document when
 * opened directly — so the caller rasterizes it first (svg-raster.ts).
 *
 * The content type is SNIFFED from the bytes, not trusted from the header:
 * CDNs routinely answer `application/octet-stream` for a PNG, and a host that
 * has dropped the file often answers 200 with an HTML page.
 */

export type LogoFetchResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; reason: string; permanent: boolean }

export const MAX_LOGO_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/**
 * Detect an acceptable logo type from the leading bytes. ICO is excluded.
 * GIF is accepted here although site-icon.ts skips it when *discovering* a mark:
 * these URLs were already chosen by a human, and a GIF wordmark is a real image
 * that upload-image-r2 also accepts.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp'
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  // SVG: text, possibly behind a BOM, an XML declaration, comments or a doctype.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 1024)).trimStart().toLowerCase()
  if (head.startsWith('<svg') || ((head.startsWith('<?xml') || head.startsWith('<!--') || head.startsWith('<!doctype svg')) && head.includes('<svg'))) {
    return 'image/svg+xml'
  }
  return null
}

export async function fetchLogoForMirror(url: string, fetchImpl: typeof fetch = fetch): Promise<LogoFetchResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'invalid_url', permanent: true }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'invalid_url', permanent: true }
  }

  let res: Response
  try {
    res = await fetchImpl(parsed.toString(), {
      headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const name = (e as Error).name
    return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', permanent: false }
  }

  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429
    return { ok: false, reason: `http_${res.status}`, permanent }
  }

  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > MAX_LOGO_BYTES) {
    await res.body?.cancel().catch(() => {})
    return { ok: false, reason: 'too_large', permanent: true }
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch {
    return { ok: false, reason: 'network', permanent: false }
  }
  if (bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, reason: 'too_large', permanent: true }
  if (bytes.byteLength < 64) return { ok: false, reason: 'empty', permanent: true }

  const contentType = sniffImageType(bytes)
  if (!contentType) return { ok: false, reason: 'not_image', permanent: true }
  return { ok: true, bytes, contentType }
}
