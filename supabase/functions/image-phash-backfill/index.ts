// Perceptual-hash backfill for image_assets.phash — the "Deno-compatible image
// decode" the visual-dedup roadmap was waiting on. Computes a 64-bit average
// hash (aHash) as a 16-char hex string, in bounded batches (pure decode, no AI
// cost). Any decode/fetch failure is skipped, never fatal. Gated by
// requireInternalOrAdmin (internal-secret / service-role / admin).
import { getServiceClient, corsResponse, jsonResponse, errorResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts'

// Tight cap: imagescript decodes the FULL image into a bitmap (w*h*4 bytes), and
// the edge isolate OOMs (546 WORKER_RESOURCE_LIMIT) after only a handful of large
// decodes. Skip anything above this; large images are marked checked, not retried.
const MAX_BYTES = 1_500_000

async function averageHashHex(bytes: Uint8Array): Promise<string | null> {
  try {
    const img = await Image.decode(bytes)
    const small = img.resize(8, 8)
    const vals: number[] = []
    let sum = 0
    // imagescript is 1-indexed; getPixelAt returns 0xRRGGBBAA.
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        const px = small.getPixelAt(x, y) >>> 0
        const r = (px >>> 24) & 0xff
        const g = (px >>> 16) & 0xff
        const b = (px >>> 8) & 0xff
        const gray = r * 0.299 + g * 0.587 + b * 0.114
        vals.push(gray)
        sum += gray
      }
    }
    const avg = sum / 64
    let bits = 0n
    for (let i = 0; i < 64; i++) bits = (bits << 1n) | (vals[i] > avg ? 1n : 0n)
    return bits.toString(16).padStart(16, '0')
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const _auth = await requireInternalOrAdmin(req, supabase)
  if (_auth instanceof Response) return _auth
  try {
    const body = await req.json().catch(() => ({}))
    // Small batches only — bounded by the isolate memory limit (see MAX_BYTES).
    const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 20)
    // Only rows never attempted (phash_checked_at IS NULL) so the sweep advances
    // instead of re-selecting the same dead-URL cluster forever.
    const { data: rows, error } = await supabase
      .from('image_assets')
      .select('id, url, optimized_url')
      .is('phash', null)
      .is('phash_checked_at', null)
      .eq('status', 'active')
      .limit(limit)
    if (error) return errorResponse(error.message, 500, req)

    const now = new Date().toISOString()
    // Stamp phash_checked_at on EVERY attempt (success or skip) so failures aren't retried.
    const markChecked = async (id: string, extra: Record<string, unknown> = {}) => {
      await supabase.from('image_assets').update({ phash_checked_at: now, ...extra }).eq('id', id)
    }

    let hashed = 0
    let skipped = 0
    for (const row of rows ?? []) {
      const id = row.id as string
      const src = (row.url as string) || (row.optimized_url as string)
      if (!src) { await markChecked(id); skipped++; continue }
      try {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 12000)
        const res = await fetch(src, { signal: controller.signal, redirect: 'follow' })
        clearTimeout(t)
        if (!res.ok) { await markChecked(id); skipped++; continue }
        const clen = Number(res.headers.get('content-length') || 0)
        if (clen > MAX_BYTES) { await markChecked(id); skipped++; continue }
        const buf = new Uint8Array(await res.arrayBuffer())
        if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) { await markChecked(id); skipped++; continue }
        const hash = await averageHashHex(buf)
        if (!hash) { await markChecked(id); skipped++; continue }
        await markChecked(id, { phash: hash })
        hashed++
      } catch {
        await markChecked(id)
        skipped++
      }
    }
    return jsonResponse({ ok: true, considered: rows?.length ?? 0, hashed, skipped }, 200, req)
  } catch (e) {
    return errorResponse((e as Error).message, 500, req)
  }
})
