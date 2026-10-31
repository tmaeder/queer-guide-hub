import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { mirrorImageToR2 } from '../_shared/logo-mirror.ts'
import { canonicaliseUrl } from '../_shared/image-assets.ts'
import { mirroredImageMetadata, sourceImageMayBeMirrored, type MirroredImageMetadata } from '../_shared/marketplace-mirrored-image.ts'

// Images are hosted on Cloudflare R2 (img.queer.guide), NOT Supabase Storage.
const R2_PREFIX = 'marketplace-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/gif'])

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function mirrorOne(_supabase: ReturnType<typeof getServiceClient>, _listingId: string, url: string): Promise<{ mirrored: string | null; hash: string | null; ext: string | null; metadata?: MirroredImageMetadata | null; reason?: string }> {
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
    return { mirrored, hash, ext, metadata: mirroredImageMetadata(buf, mirrored) }
  } catch (e) { return { mirrored: null, hash: null, ext: null, reason: (e as Error).message } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const _auth = await requireInternalOrAdmin(req, supabase); if (_auth instanceof Response) return _auth
  try {
    const body = await req.json().catch(() => ({}))
    const limit = body.limit || 25
    const listingId = body.listing_id as string | undefined
    let q = supabase.from('marketplace_listings').select('id, images, image_hashes').not('images', 'is', null).or('image_hashes.eq.[],image_hashes.is.null').limit(limit)
    if (listingId) q = q.eq('id', listingId)
    const { data: rows, error } = await q
    if (error) return errorResponse(error.message, 500, req)
    if (!rows || rows.length === 0) return jsonResponse({ success: true, items: 0, message: 'nothing to mirror' }, 200, req)
    let mirrored = 0, failed = 0, metadataFailed = 0
    for (const row of rows) {
      const originals = (row.images || []) as string[]
      if (!originals.length) continue
      const newImages: string[] = []
      const hashes: Record<string, unknown>[] = []
      const measurements: MirroredImageMetadata[] = []
      const sourceUrls = [...new Set(originals.slice(0, 6).flatMap(url => [url, canonicaliseUrl(url)].filter((value): value is string => Boolean(value))))]
      const { data: sourceAssets, error: sourceError } = await supabase.from('image_assets')
        .select('url,status,is_flagged,access_level,health_consecutive_failures,brand_category').in('url', sourceUrls)
      if (sourceError) throw new Error(`Source image restrictions could not be checked: ${sourceError.message}`)
      const blockedSources = new Set((sourceAssets ?? []).filter(asset => !sourceImageMayBeMirrored(asset)).map(asset => asset.url))
      for (const u of originals.slice(0, 6)) {
        if (!u) { continue }
        if (blockedSources.has(u) || blockedSources.has(canonicaliseUrl(u) ?? u)) {
          newImages.push(u)
          hashes.push({ original: u, error: 'source_asset_restricted' })
          failed++
          continue
        }
        const r = await mirrorOne(supabase, row.id, u)
        if (r.mirrored) { newImages.push(r.mirrored); hashes.push({ original: u, sha256: r.hash, mirrored: r.mirrored }); mirrored++; if (r.metadata) measurements.push(r.metadata) }
        else { newImages.push(u); failed++; hashes.push({ original: u, error: r.reason }) }
        await new Promise(r => setTimeout(r, 100))
      }
      const { error: listingError } = await supabase.from('marketplace_listings')
        .update({ images: newImages, image_hashes: hashes }).eq('id', row.id)
      if (listingError) throw new Error(`Listing image update failed: ${listingError.message}`)
      try {
        // The listing update registers and links the mirrored URLs. Populate
        // dimensions from those exact uploaded bytes, retaining every asset gate.
        for (const metadata of measurements) {
          const { error: assetError } = await supabase.from('image_assets')
            .update({ ...metadata, optimized_at: new Date().toISOString() })
            .eq('url', metadata.optimized_url).eq('status', 'active')
            .eq('is_flagged', false).eq('access_level', 'public')
            .or('health_consecutive_failures.is.null,health_consecutive_failures.lt.2')
          if (assetError) throw new Error(assetError.message)
        }
        if (measurements.length) {
          const { error: eligibilityError } = await supabase.rpc('marketplace_refresh_overview_eligibility', { p_listing_id: row.id })
          if (eligibilityError) throw new Error(eligibilityError.message)
        }
      } catch (error) {
        metadataFailed++
        console.error('[marketplace-image-mirror] Metadata update failed', row.id, error)
        // Preserve source provenance and let the normal queue retry. Do not
        // overwrite a listing whose images changed while this request ran.
        const { error: retryError } = await supabase.from('marketplace_listings')
          .update({ images: originals, image_hashes: row.image_hashes })
          .eq('id', row.id).eq('image_hashes', JSON.stringify(hashes))
        if (retryError) throw new Error(`Image retry restore failed: ${retryError.message}`, { cause: error })
      }
    }
    return jsonResponse({ success: metadataFailed === 0, items: rows.length, items_processed: rows.length, items_succeeded: mirrored, items_failed: failed, mirrored, failed, metadata_failed: metadataFailed }, metadataFailed ? 500 : 200, req)
  } catch (error) { return errorResponse((error as Error).message, 500, req) }
})
