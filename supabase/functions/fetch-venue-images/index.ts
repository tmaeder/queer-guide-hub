import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Batch image enricher for venues with empty images array.
// Searches Pexels and Unsplash; updates venues.images on success.

async function searchPexels(key: string, q: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=3&orientation=landscape`,
      { headers: { Authorization: key } },
    )
    if (!r.ok) return null
    const d = await r.json()
    const p = d.photos?.[0]
    return p ? (p.src?.large2x ?? p.src?.large ?? null) : null
  } catch { return null }
}

async function searchUnsplash(key: string, q: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=3&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } },
    )
    if (!r.ok) return null
    const d = await r.json()
    return d.results?.[0]?.urls?.regular ?? null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchLimit  = Math.min(body.batchLimit ?? 50, 200)
    const forceUpdate = body.forceUpdate === true
    const dryRun      = body.dry_run === true

    const pexelsKey   = Deno.env.get('PEXELS_API_KEY') ?? ''
    const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY') ?? ''
    if (!pexelsKey && !unsplashKey) {
      return jsonResponse({ success: true, skipped: true, reason: 'no image api keys configured' }, 200, req)
    }

    let q = supabase
      .from('venues')
      .select('id, name, city, country, category')
      .order('updated_at', { ascending: true })
      .limit(batchLimit)
    if (!forceUpdate) q = q.or('images.is.null,images.eq.{}')

    const { data: venues, error } = await q
    if (error) return errorResponse(error.message, 500, req)
    if (!venues?.length) return jsonResponse({ success: true, updated: 0, message: 'nothing to do' }, 200, req)

    let updated = 0, skipped = 0

    for (const v of venues) {
      const searchQ = [v.name, v.city, v.category].filter(Boolean).join(' ')
      const lgbtqQ  = `${v.name} LGBTQ ${v.city ?? ''}`.trim()

      let imageUrl: string | null = null
      if (pexelsKey)   imageUrl = await searchPexels(pexelsKey, lgbtqQ) ?? await searchPexels(pexelsKey, searchQ)
      if (!imageUrl && unsplashKey) imageUrl = await searchUnsplash(unsplashKey, lgbtqQ) ?? await searchUnsplash(unsplashKey, searchQ)

      if (!imageUrl) { skipped++; continue }
      if (dryRun)    { updated++; continue }

      const { error: upErr } = await supabase
        .from('venues')
        .update({ images: [imageUrl], updated_at: new Date().toISOString() })
        .eq('id', v.id)

      if (upErr) { console.error(`venue ${v.id}:`, upErr.message); skipped++ }
      else updated++

      await new Promise(r => setTimeout(r, 200))
    }

    return jsonResponse({ success: true, updated, skipped, total: venues.length, dry_run: dryRun }, 200, req)
  } catch (err) {
    console.error('fetch-venue-images:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
