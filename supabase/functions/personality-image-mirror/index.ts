/**
 * personality-image-mirror — re-host personality portraits onto our own R2/CDN.
 *
 * Personality `image_url`s mostly hot-link Wikimedia Commons
 * (commons.wikimedia.org/wiki/Special:FilePath/...). That works but is
 * rate-limited per client IP and never CDN-optimised (buildCfImageUrl only
 * resizes img.queer.guide hosts). This downloads the bytes, mirrors them to R2
 * via the image-cdn Worker, records the stable img.queer.guide URL as the cover
 * asset's `optimized_url` (cards prefer it via resolveImageUrl) AND repoints
 * `personalities.image_url` at it (the detail hero reads image_url directly).
 * The original Commons URL is preserved on the image_assets row for provenance.
 *
 * Idempotent + resumable: rows already on img.queer.guide are filtered out, so
 * each run advances. Drive it with scripts/backfill-images-drive.mjs
 * (FN=personality-image-mirror).
 *
 * GATED: needs IMAGE_CDN_ADMIN_SECRET (the image-cdn Worker's ADMIN_SECRET) in
 * the function env. Without it the function self-skips (no-op) so deploying it
 * is safe before the secret is configured.
 */
import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { mirrorImageToR2, logoMirrorConfigured } from '../_shared/logo-mirror.ts'
import { canonicaliseUrl } from '../_shared/image-assets.ts'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const MAX_BYTES = 8 * 1024 * 1024

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    if (!logoMirrorConfigured()) {
      return jsonResponse(
        { success: true, skipped: true, remaining: null, message: 'IMAGE_CDN_ADMIN_SECRET not configured — no-op' },
        200,
        req,
      )
    }

    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Number(body.batch_size || body.limit || 15), 50)

    // Public personalities whose portrait still hot-links an external host.
    const { data: rows, error } = await supabase
      .from('personalities')
      .select('id, image_url')
      .eq('visibility', 'public')
      .not('image_url', 'is', null)
      .not('image_url', 'ilike', '%img.queer.guide%')
      .order('updated_at', { ascending: true })
      .limit(limit)
    if (error) return errorResponse(error.message, 500, req)
    if (!rows?.length) return jsonResponse({ success: true, remaining: 0, processed: 0, message: 'nothing to mirror' }, 200, req)

    let mirrored = 0, failed = 0
    for (const p of rows) {
      const original = p.image_url as string
      const canonical = canonicaliseUrl(original) ?? original
      try {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), 20000)
        const res = await fetch(original, { signal: ac.signal, redirect: 'follow', headers: { 'User-Agent': 'QueerGuide-ImageMirror/1.0' } })
        clearTimeout(t)
        if (!res.ok) { failed++; continue }
        const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        if (!ALLOWED.has(ct)) { failed++; continue }
        const buf = new Uint8Array(await res.arrayBuffer())
        if (!buf.byteLength || buf.byteLength > MAX_BYTES) { failed++; continue }

        const cdnUrl = await mirrorImageToR2(buf, ct, 'personalities')
        if (!cdnUrl) { failed++; continue }

        // Record the asset (original URL preserved for provenance) + cover link.
        const { data: asset } = await supabase
          .from('image_assets')
          .upsert(
            {
              url_hash: await sha256Hex(canonical),
              url: canonical,
              source: 'wikimedia',
              optimized_url: cdnUrl,
              optimization_status: 'optimized',
              optimized_at: new Date().toISOString(),
              bytes: buf.byteLength,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'url_hash' },
          )
          .select('id')
          .single()
        if (asset) {
          await supabase.from('image_asset_links').upsert(
            { asset_id: asset.id, entity_type: 'personality', entity_id: p.id, role: 'cover', sort_order: 0 },
            { onConflict: 'asset_id,entity_type,entity_id,role' },
          )
        }

        // Repoint the row at the CDN copy so the detail hero stops hot-linking.
        await supabase.from('personalities').update({ image_url: cdnUrl, updated_at: new Date().toISOString() }).eq('id', p.id)
        mirrored++
        await new Promise((r) => setTimeout(r, 120))
      } catch { failed++ }
    }

    const { count: remaining } = await supabase
      .from('personalities')
      .select('id', { count: 'exact', head: true })
      .eq('visibility', 'public')
      .not('image_url', 'is', null)
      .not('image_url', 'ilike', '%img.queer.guide%')

    return jsonResponse(
      { success: true, processed: rows.length, mirrored, failed, remaining: remaining ?? null },
      200,
      req,
    )
  } catch (e) {
    return errorResponse((e as Error).message, 500, req)
  }
})
