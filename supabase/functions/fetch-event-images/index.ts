import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Batch image enricher for events with empty images array.
// Searches Pexels and Unsplash using event title + city.

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

    // Only upcoming/recent events worth enriching
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    let q = supabase
      .from('events')
      .select('id, title, city, country, event_type')
      .gte('start_date', cutoff)
      .order('start_date', { ascending: true })
      .limit(batchLimit)
    if (!forceUpdate) q = q.or('images.is.null,images.eq.{}')

    const { data: events, error } = await q
    if (error) return errorResponse(error.message, 500, req)
    if (!events?.length) return jsonResponse({ success: true, updated: 0, message: 'nothing to do' }, 200, req)

    let updated = 0, skipped = 0

    for (const e of events) {
      const lgbtqQ = `${e.event_type ?? 'pride'} LGBT event ${e.city ?? ''}`.trim()
      const titleQ = `${e.title} ${e.city ?? ''}`.trim()

      let imageUrl: string | null = null
      if (pexelsKey)   imageUrl = await searchPexels(pexelsKey, lgbtqQ) ?? await searchPexels(pexelsKey, titleQ)
      if (!imageUrl && unsplashKey) imageUrl = await searchUnsplash(unsplashKey, lgbtqQ) ?? await searchUnsplash(unsplashKey, titleQ)

      if (!imageUrl) { skipped++; continue }
      if (dryRun)    { updated++; continue }

      const { error: upErr } = await supabase
        .from('events')
        .update({ images: [imageUrl], updated_at: new Date().toISOString() })
        .eq('id', e.id)

      if (upErr) { console.error(`event ${e.id}:`, upErr.message); skipped++ }
      else updated++

      await new Promise(r => setTimeout(r, 200))
    }

    return jsonResponse({ success: true, updated, skipped, total: events.length, dry_run: dryRun }, 200, req)
  } catch (err) {
    console.error('fetch-event-images:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
