import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { enrichVenueWithAI } from '../_shared/ai-enrichment.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

// Pipeline Enrich (Venue/Hotel) — AI description + tags + LGBTQ context.
// Reads pending venue/hotel staging rows, writes enriched_data, sets enrichment_status.
// Idempotent (skips already-enriched rows).

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize     = Math.min(200, body.batch_size ?? 50)
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, entity_type, target_table')
      .in('target_table', ['venues'])
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
      const loc = (n.location ?? {}) as Record<string, unknown>
      const name = String(n.name ?? '').trim()
      if (!name) { skipped++; continue }

      const startedAt = Date.now()
      let ai: Awaited<ReturnType<typeof enrichVenueWithAI>> = null
      let aiError: string | null = null

      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.enrich-venue',
          () => enrichVenueWithAI(supabase, {
            name,
            description: String(n.description ?? '').slice(0, 400),
            address:     String(loc.address ?? ''),
            city:        String(loc.city ?? ''),
            country:     String(loc.country ?? ''),
            category:    String(n.category ?? n.venue_type ?? ''),
            tags:        (n.tags ?? []) as string[],
          }))
      } catch (e) {
        aiError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
        console.warn(`enrich-venue LLM ${item.id}: ${aiError}`)
      }

      if (!dryRun) {
        const status = ai ? 'success' : (aiError ? 'failed' : 'skipped')

        if (ai) {
          const merged = {
            ...n,
            description: n.description || ai.description || '',
            tags: Array.from(new Set([...(n.tags as string[] ?? []), ...(ai.suggested_tags ?? [])])).slice(0, 20),
          }
          await supabase.from('ingestion_staging')
            .update({ normalized_data: merged })
            .eq('id', item.id)
        }

        const enrichedData = {
          ai_description:          ai?.description ?? null,
          ai_lgbtq_context:        ai?.lgbtq_context ?? null,
          ai_tags:                 ai?.suggested_tags ?? [],
          ai_lgbtq_relevance_score: ai?.lgbtq_relevance_score ?? null,
          ai_category:             ai?.category_suggestion ?? null,
          ai_amenities:            ai?.amenity_suggestions ?? [],
          enriched_at:             new Date().toISOString(),
        }

        const { error: applyErr } = await supabase.rpc('apply_enrichment', {
          p_staging_id:      item.id,
          p_pipeline_run_id: pipelineRunId ?? null,
          p_stage:           'enrich-venue',
          p_new_enriched:    enrichedData,
          p_actor:           'pipeline-enrich-venue',
          p_status:          status,
          p_error_message:   aiError,
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
    console.error('pipeline-enrich-venue:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
