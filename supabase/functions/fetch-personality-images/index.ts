import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Batch image enricher for personalities missing image_url.
// Tries Wikipedia REST API first (free), then Pexels as fallback.

const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

async function fetchWikipediaImage(name: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`
    const res = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    return d.thumbnail?.source ?? d.originalimage?.source ?? null
  } catch { return null }
}

async function searchPexels(key: string, q: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=3`,
      { headers: { Authorization: key } },
    )
    if (!r.ok) return null
    const d = await r.json()
    const p = d.photos?.[0]
    return p ? (p.src?.medium ?? null) : null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchLimit  = Math.min(body.batchLimit ?? 30, 100)
    const forceUpdate = body.forceUpdate === true
    const dryRun      = body.dry_run === true

    const pexelsKey = Deno.env.get('PEXELS_API_KEY') ?? ''

    let q = supabase
      .from('personalities')
      .select('id, name, profession, nationality')
      .order('updated_at', { ascending: true })
      .limit(batchLimit)
    if (!forceUpdate) q = q.or('image_url.is.null,image_url.eq.')

    const { data: personalities, error } = await q
    if (error) return errorResponse(error.message, 500, req)
    if (!personalities?.length) return jsonResponse({ success: true, updated: 0, message: 'nothing to do' }, 200, req)

    let updated = 0, skipped = 0

    for (const p of personalities) {
      let imageUrl: string | null = null

      // Try Wikipedia first
      imageUrl = await fetchWikipediaImage(p.name)

      // Pexels fallback using name
      if (!imageUrl && pexelsKey) {
        imageUrl = await searchPexels(pexelsKey, `${p.name} ${p.profession ?? 'portrait'}`)
      }

      if (!imageUrl) { skipped++; continue }
      if (dryRun)    { updated++; continue }

      const { error: upErr } = await supabase
        .from('personalities')
        .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq('id', p.id)

      if (upErr) { console.error(`personality ${p.id}:`, upErr.message); skipped++ }
      else updated++

      await new Promise(r => setTimeout(r, 300))
    }

    return jsonResponse({ success: true, updated, skipped, total: personalities.length, dry_run: dryRun }, 200, req)
  } catch (err) {
    console.error('fetch-personality-images:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
