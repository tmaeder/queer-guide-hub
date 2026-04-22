import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

// Pipeline Enrich (Queer Village) — Wikipedia description + Wikidata + image enrichment.
// Reads pending queer_villages staging rows, writes enriched_data.

const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

async function fetchWikipediaSummary(query: string): Promise<{ extract: string; thumbnail?: string } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    return { extract: d.extract ?? '', thumbnail: d.thumbnail?.source ?? undefined }
  } catch { return null }
}

async function searchWikidata(name: string): Promise<{ qid: string; description: string } | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=1&type=item`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const d = await res.json()
    const hit = d.search?.[0]
    if (!hit) return null
    return { qid: hit.id, description: hit.description ?? '' }
  } catch { return null }
}

async function fetchPexelsImage(query: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: apiKey } },
    )
    if (!res.ok) return null
    const d = await res.json()
    const photo = d.photos?.[0]
    return photo ? (photo.src?.large2x ?? photo.src?.large ?? null) : null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize     = Math.min(50, body.batch_size ?? 20)
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .in('target_table', ['queer_villages'])
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

    const pexelsKey = Deno.env.get('PEXELS_API_KEY') ?? ''
    let enriched = 0, failed = 0, skipped = 0

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const name = String(n.name ?? '').trim()
      if (!name) { skipped++; continue }

      const startedAt = Date.now()
      let enrichError: string | null = null
      let wp: { extract: string; thumbnail?: string } | null = null
      let wd: { qid: string; description: string } | null = null
      let imageUrl: string | null = null

      try {
        const searchQuery = `${name} LGBT neighborhood`
        ;[wp, wd] = await Promise.all([
          withCircuitBreaker(supabase, 'wikipedia.api', () => fetchWikipediaSummary(searchQuery)),
          withCircuitBreaker(supabase, 'wikidata.api', () => searchWikidata(name)),
        ])
        if (!wp?.extract) {
          wp = await fetchWikipediaSummary(name)
        }
        if (pexelsKey) {
          imageUrl = await fetchPexelsImage(`${name} LGBT pride`, pexelsKey)
        }
        if (!imageUrl && wp?.thumbnail) {
          imageUrl = wp.thumbnail
        }
      } catch (e) {
        enrichError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
        console.warn(`enrich-village ${item.id}: ${enrichError}`)
      }

      if (!dryRun) {
        const hasData = !!(wp?.extract || wd)
        const status = hasData ? 'success' : (enrichError ? 'failed' : 'skipped')

        const updates: Record<string, unknown> = { ...n }
        if (wp?.extract && !n.description) updates.description = wp.extract
        if (imageUrl && !n.image_url) updates.image_url = imageUrl

        if (Object.keys(updates).length > Object.keys(n).length) {
          await supabase.from('ingestion_staging')
            .update({ normalized_data: updates })
            .eq('id', item.id)
        }

        const enrichedData = {
          wikipedia_extract:   wp?.extract ?? null,
          wikipedia_thumbnail: wp?.thumbnail ?? null,
          wikidata_qid:        wd?.qid ?? null,
          wikidata_description: wd?.description ?? null,
          image_url:           imageUrl,
          enriched_at:         new Date().toISOString(),
        }

        const { error: applyErr } = await supabase.rpc('apply_enrichment', {
          p_staging_id:      item.id,
          p_pipeline_run_id: pipelineRunId ?? null,
          p_stage:           'enrich-village',
          p_new_enriched:    enrichedData,
          p_actor:           'pipeline-enrich-village',
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
    console.error('pipeline-enrich-village:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
