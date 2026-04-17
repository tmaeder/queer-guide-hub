import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'

// ============================================================
// Pipeline Geocode
// Hoisted out of pipeline-normalize because synchronous Photon calls
// block normalization for every item. This function:
//   1. Pulls items that are normalized but still lack geo coords
//   2. Geocodes via Photon, with an in-memory LRU cache keyed by
//      (city|country|address). Same city scraped 500 times = 1 network call.
//   3. Writes lat/lng back into normalized_data.location
//
// Meant to run after pipeline-normalize and before pipeline-deduplicate so
// dedup can use coordinates. Self-healing: idempotent; re-processes any row
// that still lacks coords.
// ============================================================

interface GeoCache {
  get(key: string): { lat: number; lng: number } | null | undefined
  set(key: string, value: { lat: number; lng: number } | null): void
}

// Minimal LRU — good enough for single-invocation batches. Shared across
// items in the same Deno request; cold on every cold start, which is fine
// because repeat queries within one batch are the win we care about.
function makeLru(capacity: number): GeoCache {
  const m = new Map<string, { lat: number; lng: number } | null>()
  return {
    get(key) {
      const v = m.get(key)
      if (v !== undefined) {
        // refresh
        m.delete(key); m.set(key, v)
      }
      return v
    },
    set(key, value) {
      if (m.has(key)) m.delete(key)
      m.set(key, value)
      if (m.size > capacity) {
        const first = m.keys().next().value
        if (first !== undefined) m.delete(first)
      }
    },
  }
}

const PHOTON_URL = Deno.env.get('PHOTON_URL') ?? 'https://photon.komoot.io/api'

async function photonGeocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'QueerGuidePipeline/1.0' } })
    if (!res.ok) return null
    const body = await res.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> }
    const coords = body.features?.[0]?.geometry?.coordinates
    if (!coords) return null
    return { lng: coords[0], lat: coords[1] }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const entityType = body.entityType as string | undefined
    const batchSize = (body.batch_size as number | undefined) ?? 50
    const dryRun = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .not('normalized_data', 'is', null)
      .in('disposition', ['pending'])
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)
    if (entityType)    q = q.eq('entity_type', entityType)

    const { data: items, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to geocode' }, 200, req)
    }

    const cache = makeLru(500)
    let geocoded = 0
    let cached = 0
    let skipped = 0

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const type = item.entity_type ?? entityType ?? ''
      // Only geocode venue/event/stay; places usually come from Wikipedia with geo.
      if (!['venue', 'event', 'stay'].includes(type)) { skipped++; continue }

      const loc = (n.location as Record<string, unknown>) ?? {}
      const hasGeo = Number.isFinite(loc.lat as number) && Number.isFinite(loc.lng as number)
      if (hasGeo) { skipped++; continue }

      const addr = [loc.address, loc.city, loc.country].filter(Boolean).map(String).join(', ')
      if (addr.length < 4) { skipped++; continue }

      const key = addr.toLowerCase()
      let coords = cache.get(key)
      if (coords === undefined) {
        coords = await photonGeocode(addr)
        cache.set(key, coords)
      } else {
        cached++
      }

      if (!coords) { skipped++; continue }

      if (!dryRun) {
        (n.location as Record<string, unknown>) = { ...loc, lat: coords.lat, lng: coords.lng }
        n.geocoded_by = 'photon'
        n.geocoded_at = new Date().toISOString()

        const { error: upErr } = await supabase
          .from('ingestion_staging')
          .update({ normalized_data: n, updated_at: new Date().toISOString() })
          .eq('id', item.id)
        if (upErr) {
          console.error(`geocode update ${item.id}:`, upErr.message)
          skipped++; continue
        }
      }
      geocoded++
    }

    return jsonResponse({
      success: true,
      items: items.length,
      geocoded,
      cached,
      skipped,
      dry_run: dryRun,
    }, 200, req)
  } catch (e) {
    console.error('pipeline-geocode:', e)
    await logPipelineError(supabase, 'pipeline-geocode', e, { severity: 'fatal' })
    return errorResponse((e as Error).message, 500, req)
  }
})
