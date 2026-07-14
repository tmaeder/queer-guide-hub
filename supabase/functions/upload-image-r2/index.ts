// JWT-gated image upload → Cloudflare R2 (img.queer.guide).
//
// The browser cannot hold the image-cdn ADMIN_SECRET, so frontend uploads
// (tag images, personality photos, flyer scans, feedback screenshots) POST the
// bytes here; this function verifies the caller's Supabase JWT and mirrors the
// bytes to R2 via the shared helper. No image is ever hosted on Supabase
// Storage.
//
// Request (JSON):  { dataUrl?: string, base64?: string, contentType?: string, prefix: string }
//   dataUrl  — a `data:<type>;base64,<...>` string (contentType inferred), OR
//   base64   — raw base64 body + explicit contentType
//   prefix   — R2 key namespace, e.g. "tag-images", "flyer-scans"
// Response:        { url: string }
//
// Env: IMAGE_CDN_ADMIN_SECRET, IMAGE_CDN_BASE_URL (see _shared/logo-mirror.ts).
// Deploy with verify_jwt=true (default) so only authenticated users can upload.

import { jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { mirrorImageToR2, logoMirrorConfigured } from '../_shared/logo-mirror.ts'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_PREFIXES = new Set([
  'tag-images', 'personalities', 'flyer-scans', 'feedback-screenshots',
  'city-images', 'country-images', 'village-images', 'adult-model-images',
])

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST only', 405, req)
  if (!logoMirrorConfigured()) return errorResponse('R2 not configured', 500, req)

  try {
    const body = await req.json().catch(() => ({}))
    const prefix = String(body.prefix || '')
    if (!ALLOWED_PREFIXES.has(prefix)) return errorResponse('invalid prefix', 400, req)

    let bytes: Uint8Array
    let contentType = String(body.contentType || 'image/jpeg')
    if (typeof body.dataUrl === 'string' && body.dataUrl.startsWith('data:')) {
      const m = body.dataUrl.match(/^data:([^;]+);base64,(.*)$/s)
      if (!m) return errorResponse('bad dataUrl', 400, req)
      contentType = m[1]
      bytes = decodeBase64(m[2])
    } else if (typeof body.base64 === 'string') {
      bytes = decodeBase64(body.base64)
    } else {
      return errorResponse('dataUrl or base64 required', 400, req)
    }

    if (bytes.byteLength < 100) return errorResponse('too small', 400, req)
    if (bytes.byteLength > MAX_BYTES) return errorResponse('too large', 400, req)
    if (!contentType.startsWith('image/')) return errorResponse('not an image', 400, req)

    const url = await mirrorImageToR2(bytes, contentType, prefix)
    if (!url) return errorResponse('upload failed', 502, req)
    return jsonResponse({ url }, 200, req)
  } catch (e) {
    return errorResponse((e as Error).message, 500, req)
  }
})
