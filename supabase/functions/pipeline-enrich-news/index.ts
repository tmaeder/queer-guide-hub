import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { enrichNewsWithAI } from '../_shared/ai-enrichment.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

// Pipeline Enrich (News) — AI summary + tags + LGBTQ relevance + sentiment.
// Reads pending news_articles staging rows, writes enriched_data.

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
      .select('id, normalized_data, entity_type, target_table')
      .in('target_table', ['news_articles'])
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
      const title = String(n.title ?? n.name ?? '').trim()
      if (!title) { skipped++; continue }

      const startedAt = Date.now()
      let ai: Awaited<ReturnType<typeof enrichNewsWithAI>> = null
      let aiError: string | null = null

      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.enrich-news',
          () => enrichNewsWithAI(supabase, {
            title,
            content:  String(n.content ?? n.body ?? '').slice(0, 800),
            excerpt:  String(n.excerpt ?? n.description ?? '').slice(0, 400),
            url:      String(n.url ?? n.source_url ?? ''),
          }))
      } catch (e) {
        aiError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
        console.warn(`enrich-news LLM ${item.id}: ${aiError}`)
      }

      if (!dryRun) {
        const status = ai ? 'success' : (aiError ? 'failed' : 'skipped')

        if (ai) {
          const merged = {
            ...n,
            description: n.description || ai.summary || '',
            tags: Array.from(new Set([...(n.tags as string[] ?? []), ...(ai.suggested_tags ?? [])])).slice(0, 20),
          }
          await supabase.from('ingestion_staging')
            .update({ normalized_data: merged })
            .eq('id', item.id)
        }

        const enrichedData = {
          ai_summary:               ai?.summary ?? null,
          ai_tags:                  ai?.suggested_tags ?? [],
          ai_lgbtq_relevance_score: ai?.lgbtq_relevance_score ?? null,
          ai_sentiment:             ai?.sentiment ?? null,
          ai_topics:                ai?.topics ?? [],
          enriched_at:              new Date().toISOString(),
        }

        const { error: applyErr } = await supabase.rpc('apply_enrichment', {
          p_staging_id:      item.id,
          p_pipeline_run_id: pipelineRunId ?? null,
          p_stage:           'enrich-news',
          p_new_enriched:    enrichedData,
          p_actor:           'pipeline-enrich-news',
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
    console.error('pipeline-enrich-news:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
