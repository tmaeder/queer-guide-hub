// Source REAL venue photos from the Foursquare 2025 Places API, coords-validated (radius=400m
// → match is the venue at that location). Writes venues.images[]. Resumable: keyset by id via
// `after` (driver passes back `last`). REQUIRES Foursquare account credits (429 = out of credits).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { batch_size = 20, after = '00000000-0000-0000-0000-000000000000' } = await req.json().catch(() => ({}))
    const fsq = Deno.env.get('FOURSQUARE_API_KEY')
    if (!fsq) return json({ error: 'FOURSQUARE_API_KEY not set' }, 500)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: rows, error } = await sb.from('venues').select('id,name,latitude,longitude')
      .is('duplicate_of_id', null).not('latitude', 'is', null).or('images.is.null')
      .gt('id', after).order('id', { ascending: true }).limit(batch_size)
    if (error) return json({ error: error.message }, 500)
    if (!rows?.length) return json({ done: true, processed: 0, found: 0, last: after })
    let found = 0, last = after, nocredits = 0
    for (const v of rows) {
      last = v.id
      try {
        if (!v.name || v.latitude == null) continue
        const url = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(v.name)}&ll=${v.latitude},${v.longitude}&radius=400&limit=1&fields=fsq_place_id,name,photos`
        const r = await fetch(url, { headers: { Authorization: `Bearer ${fsq}`, 'X-Places-Api-Version': '2025-06-17', Accept: 'application/json' } })
        if (r.status === 429) { nocredits++; continue }
        if (!r.ok) continue
        const j = await r.json()
        const place = j.results?.[0]
        if (!place?.photos?.length) continue
        const p = place.photos[0]
        await sb.from('venues').update({ images: [`${p.prefix}400x400${p.suffix}`], updated_at: new Date().toISOString() }).eq('id', v.id)
        found++
      } catch { /* skip */ }
    }
    return json({ processed: rows.length, found, last, nocredits })
  } catch (e) { return json({ error: String(e) }, 500) }
})
