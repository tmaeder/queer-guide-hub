import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { enrichEventWithAI } from '../_shared/ai-enrichment.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (Events) — AI description + type + tags + LGBTQ relevance.
// Reads pending event staging rows, writes enriched_data, sets enrichment_status.
// Idempotent (skips already-enriched rows).

const WALL_CLOCK_LIMIT_MS = 90_000

Deno.serve(withErrorReporting('pipeline-enrich-events', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize     = Math.min(200, body.batch_size ?? 20)
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, entity_type, target_table')
      .in('target_table', ['events'])
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
    const deadline = Date.now() + WALL_CLOCK_LIMIT_MS

    for (const item of items) {
      if (Date.now() > deadline) break
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const loc = (n.location ?? {}) as Record<string, unknown>
      const title = String(n.title ?? n.name ?? '').trim()
      if (!title) { skipped++; continue }

      const startedAt = Date.now()
      let ai: Awaited<ReturnType<typeof enrichEventWithAI>> = null
      let aiError: string | null = null

      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.enrich-events',
          () => enrichEventWithAI(supabase, {
            title,
            description: String(n.description ?? '').slice(0, 500),
            city:        String(loc.city ?? ''),
            country:     String(loc.country ?? ''),
            event_type:  String(n.event_type ?? n.category ?? ''),
            venue_name:  String(n.venue_name ?? ''),
          }))
      } catch (e) {
        aiError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
        console.warn(`enrich-events LLM ${item.id}: ${aiError}`)
      }

      if (!dryRun) {
        const status = ai ? 'success' : (aiError ? 'failed' : 'skipped')

        if (ai) {
          const merged = {
            ...n,
            description: n.description || ai.description || '',
            event_type:  n.event_type  || ai.event_type  || n.event_type,
            tags: Array.from(new Set([...(n.tags as string[] ?? []), ...(ai.suggested_tags ?? [])])).slice(0, 20),
          }
          await supabase.from('ingestion_staging')
            .update({ normalized_data: merged })
            .eq('id', item.id)
        }

        const enrichedData = {
          ai_description:           ai?.description ?? null,
          ai_event_type:            ai?.event_type ?? null,
          ai_tags:                  ai?.suggested_tags ?? [],
          ai_lgbtq_relevance_score: ai?.lgbtq_relevance_score ?? null,
          ai_target_audience:       ai?.target_audience ?? null,
          enriched_at:              new Date().toISOString(),
        }

        const { error: applyErr } = await supabase.rpc('apply_enrichment', {
          p_staging_id:      item.id,
          p_pipeline_run_id: pipelineRunId ?? null,
          p_stage:           'enrich-events',
          p_new_enriched:    enrichedData,
          p_actor:           'pipeline-enrich-events',
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
    console.error('pipeline-enrich-events:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
