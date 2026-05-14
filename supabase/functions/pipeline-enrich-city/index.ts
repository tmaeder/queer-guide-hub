import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (City) — Wikipedia description + coordinates + image fetch.
// Reads pending city staging rows, writes enriched_data, sets enrichment_status.

const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

async function fetchWikipediaSummary(query: string): Promise<{ extract: string; thumbnail?: string; coordinates?: { lat: number; lon: number } } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    return {
      extract: d.extract ?? '',
      thumbnail: d.thumbnail?.source ?? undefined,
      coordinates: d.coordinates ? { lat: d.coordinates.lat, lon: d.coordinates.lon } : undefined,
    }
  } catch { return null }
}

Deno.serve(withErrorReporting('pipeline-enrich-city', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize     = Math.min(100, body.batch_size ?? 30)
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .in('target_table', ['cities'])
      .eq('enrichment_status', 'pending')
      .not('normalized_data', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to enrich' }, 200, req)
    }

    let enriched = 0, failed = 0, skipped = 0

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const name = String(n.name ?? '').trim()
      const country = String(n.country_name ?? n.country ?? '').trim()
      if (!name) { skipped++; continue }

      const startedAt = Date.now()
      let wp: { extract: string; thumbnail?: string; coordinates?: { lat: number; lon: number } } | null = null
      let enrichError: string | null = null

      try {
        const query = country ? `${name}, ${country}` : name
        wp = await withCircuitBreaker(supabase, 'wikipedia.api',
          () => fetchWikipediaSummary(query))
        // fallback: try just the city name
        if (!wp?.extract) {
          wp = await fetchWikipediaSummary(name)
        }
      } catch (e) {
        enrichError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
        console.warn(`enrich-city Wikipedia ${item.id}: ${enrichError}`)
      }

      if (!dryRun) {
        const status = wp?.extract ? 'success' : (enrichError ? 'failed' : 'skipped')

        if (wp?.extract && !n.description) {
          await supabase.from('ingestion_staging')
            .update({ normalized_data: { ...n, description: wp.extract } })
            .eq('id', item.id)
        }

        const enrichedData = {
          wikipedia_extract:   wp?.extract ?? null,
          wikipedia_thumbnail: wp?.thumbnail ?? null,
          wikipedia_lat:       wp?.coordinates?.lat ?? null,
          wikipedia_lon:       wp?.coordinates?.lon ?? null,
          enriched_at:         new Date().toISOString(),
        }

        const { error: applyErr } = await supabase.rpc('apply_enrichment', {
          p_staging_id:      item.id,
          p_pipeline_run_id: pipelineRunId ?? null,
          p_stage:           'enrich-city',
          p_new_enriched:    enrichedData,
          p_actor:           'pipeline-enrich-city',
          p_status:          status,
          p_error_message:   enrichError,
          p_duration_ms:     Date.now() - startedAt,
        })

        if (applyErr) { failed++; console.error(`apply_enrichment ${item.id}: ${applyErr.message}`); continue }

        if (status === 'success') enriched++
        else if (status === 'failed') failed++
        else skipped++
      } else { enriched++ }
    }

    return jsonResponse({
      success: true,
      items: enriched + skipped,
      items_total: items.length,
      items_processed: enriched + failed + skipped,
      items_succeeded: enriched,
      items_failed: failed,
      enriched, failed, skipped,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-enrich-city:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
