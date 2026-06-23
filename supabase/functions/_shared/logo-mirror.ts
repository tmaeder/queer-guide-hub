/**
 * Mirror logo image bytes into our own Cloudflare R2 bucket (served from
 * img.queer.guide) instead of hot-linking logo.dev.
 *
 * Why: logo.dev image URLs embed the API token as a query param, so storing them
 * in a public `logo_url` leaks the key on every page view. Mirroring the bytes to
 * R2 gives a stable, self-hosted, token-free URL — the same way avatars and
 * marketplace images are already handled.
 *
 * R2 is bound only to the `image-cdn` Worker, not to edge functions, so we upload
 * through that Worker's admin-gated `PUT /upload/{key}` endpoint (the same one
 * used by the image uploaders). Keys are content-addressed (SHA-256 of the
 * bytes), so identical logos dedupe automatically and re-uploads are idempotent.
 *
 * Env:
 *   IMAGE_CDN_BASE_URL      public base, default "https://img.queer.guide"
 *   IMAGE_CDN_ADMIN_SECRET  must equal the image-cdn Worker's ADMIN_SECRET
 */

const CDN_BASE = (Deno.env.get('IMAGE_CDN_BASE_URL') || 'https://img.queer.guide').replace(/\/+$/, '')
const CDN_SECRET = Deno.env.get('IMAGE_CDN_ADMIN_SECRET') || ''

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** True when an R2 upload target is configured (the secret is present). */
export function logoMirrorConfigured(): boolean {
  return CDN_SECRET.length > 0
}

/**
 * Upload logo bytes to R2 via the image-cdn Worker and return the public,
 * token-free CDN URL (e.g. https://img.queer.guide/logos/<hash>.png). Returns
 * null if the mirror isn't configured or the upload fails, so the caller can
 * leave logo_url null and retry on a later run.
 */
export async function mirrorLogoToR2(
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  if (!CDN_SECRET) return null
  const type = contentType.split(';')[0].trim().toLowerCase()
  const ext = EXT_BY_TYPE[type] ?? 'png'
  const hash = await sha256Hex(bytes)
  const key = `logos/${hash}.${ext}`

  try {
    const res = await fetch(`${CDN_BASE}/upload/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': type || 'image/png', 'X-Admin-Secret': CDN_SECRET },
      body: bytes,
    })
    if (!res.ok) return null
    return `${CDN_BASE}/${key}`
  } catch {
    return null
  }
}
