import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { mirrorImageToR2 } from '../_shared/logo-mirror.ts'

// Images are hosted on Cloudflare R2 (img.queer.guide), NOT Supabase Storage.
const R2_PREFIX = 'marketplace-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/gif'])

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function mirrorOne(_supabase: ReturnType<typeof getServiceClient>, _listingId: string, url: string): Promise<{ mirrored: string | null; hash: string | null; ext: string | null; reason?: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timeout)
    if (!res.ok) return { mirrored: null, hash: null, ext: null, reason: `http_${res.status}` }
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED.has(ct)) return { mirrored: null, hash: null, ext: null, reason: `unsupported_type_${ct}` }
    const clen = Number(res.headers.get('content-length') || 0)
    if (clen > MAX_BYTES) return { mirrored: null, hash: null, ext: null, reason: 'too_large' }
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) return { mirrored: null, hash: null, ext: null, reason: 'too_large' }
    const hash = await sha256Hex(buf)
    const ext = ct === 'image/jpeg' ? 'jpg' : ct.split('/')[1]
    const mirrored = await mirrorImageToR2(buf, ct, R2_PREFIX)
    if (!mirrored) return { mirrored: null, hash, ext, reason: 'r2_upload_failed' }
    return { mirrored, hash, ext }
  } catch (e) { return { mirrored: null, hash: null, ext: null, reason: (e as Error).message } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const limit = body.limit || 25
    const listingId = body.listing_id as string | undefined
    let q = supabase.from('marketplace_listings').select('id, images, image_hashes').not('images', 'is', null).or('image_hashes.eq.[],image_hashes.is.null').limit(limit)
    if (listingId) q = q.eq('id', listingId)
    const { data: rows, error } = await q
    if (error) return errorResponse(error.message, 500, req)
    if (!rows || rows.length === 0) return jsonResponse({ success: true, items: 0, message: 'nothing to mirror' }, 200, req)
    let mirrored = 0, failed = 0
    for (const row of rows) {
      const originals = (row.images || []) as string[]
      if (!originals.length) continue
      const newImages: string[] = []
      const hashes: Record<string, unknown>[] = []
      for (const u of originals.slice(0, 6)) {
        if (!u) { continue }
        const r = await mirrorOne(supabase, row.id, u)
        if (r.mirrored) { newImages.push(r.mirrored); hashes.push({ original: u, sha256: r.hash, mirrored: r.mirrored }); mirrored++ }
        else { newImages.push(u); failed++; hashes.push({ original: u, error: r.reason }) }
        await new Promise(r => setTimeout(r, 100))
      }
      await supabase.from('marketplace_listings').update({ images: newImages, image_hashes: hashes }).eq('id', row.id)
    }
    return jsonResponse({ success: true, items: rows.length, items_processed: rows.length, items_succeeded: mirrored, items_failed: failed, mirrored, failed }, 200, req)
  } catch (error) { return errorResponse((error as Error).message, 500, req) }
})
