import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { llmChatCompletion } from '../_shared/llm-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import {
  SAFETY_RELEVANCE_SYSTEM,
  buildSafetyRelevanceUserPrompt,
  parseSafetyRelevance,
} from '../_shared/prompts/safety-relevance.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'

// ============================================================
// Pipeline node: Safety + Relevance
// ------------------------------------------------------------
// Reads community_submissions rows that have been through normalize
// + media-process. Calls the LLM to score LGBTQ+ relevance and flag
// content risks. Persists scores back to community_submissions and
// flips priority/needs_review when confidence is low or any high
// severity flag is present.
// ============================================================

const MIN_CONFIDENCE_DEFAULT = 0.6
const BATCH_SIZE_DEFAULT = 20
const WALL_CLOCK_LIMIT_MS = 45_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const nodeId = body.node_id as string | undefined
    const batchSize = Number(body.batch_size) || BATCH_SIZE_DEFAULT
    const minConfidence = Number(body.min_confidence) || MIN_CONFIDENCE_DEFAULT
    const dryRun = body.dry_run === true

    const { data: rows, error } = await supabase
      .from('community_submissions')
      .select(
        'id, platform, source_url, raw_text, ocr_text, vision_summary, transcript_text, queer_relevance_score, priority, labels',
      )
      .eq('status', 'pending')
      .is('queer_relevance_score', null)
      .in('media_processing_status', ['done', 'partial', 'skipped', 'not_applicable'])
      .order('submitted_at', { ascending: true })
      .limit(batchSize)

    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows?.length) {
      return jsonResponse(
        { success: true, items: 0, items_processed: 0, message: 'nothing to score' },
        200,
        req,
      )
    }

    let ok = 0
    let failed = 0
    const flagged: string[] = []
    const deadline = Date.now() + WALL_CLOCK_LIMIT_MS

    for (const row of rows) {
      if (Date.now() > deadline) break
      try {
        const userPrompt = buildSafetyRelevanceUserPrompt({
          raw_text: row.raw_text,
          ocr_text: row.ocr_text,
          vision_summary: row.vision_summary,
          transcript_text: row.transcript_text,
          source_url: row.source_url,
          platform: row.platform,
        })

        const result = await withCircuitBreaker(
          supabase,
          'cf-ai-safety-relevance',
          () =>
            llmChatCompletion({
              messages: [
                { role: 'system', content: SAFETY_RELEVANCE_SYSTEM },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.1,
              max_tokens: 800,
              response_format: { type: 'json_object' },
              timeoutMs: 30_000,
            }),
        )

        const parsed = parseSafetyRelevance(result.content)

        const hasHighSeverity = parsed.safety_flags.some((f) => f.severity === 'high')
        const lowConfidence = parsed.confidence_score < minConfidence
        const needsReview =
          parsed.needs_human_review || hasHighSeverity || lowConfidence

        const labels = new Set<string>(Array.isArray(row.labels) ? row.labels : [])
        if (needsReview) labels.add('needs_review')
        for (const f of parsed.safety_flags) {
          if (f.severity === 'high') labels.add(`safety:${f.type}`)
        }

        if (!dryRun) {
          const { error: updErr } = await supabase
            .from('community_submissions')
            .update({
              queer_relevance_score: parsed.queer_relevance_score,
              confidence_score: parsed.confidence_score,
              safety_flags: parsed.safety_flags,
              priority: hasHighSeverity ? 10 : (row.priority ?? 5),
              labels: Array.from(labels),
            })
            .eq('id', row.id)

          if (updErr) throw new Error(`update: ${updErr.message}`)
        }

        ok++
        if (needsReview) flagged.push(row.id)

        // Be polite to upstream model.
        await new Promise((r) => setTimeout(r, 150))
      } catch (e) {
        failed++
        const msg = e instanceof Error ? e.message : String(e)
        const isOpen = e instanceof CircuitOpenError
        await logPipelineError(supabase, 'pipeline-safety-relevance', e, {
          pipeline_run_id: pipelineRunId ?? null,
          severity: isOpen ? 'warn' : 'error',
          context: { row_id: row.id, node_id: nodeId ?? null, msg },
        })
        if (isOpen) break
      }
    }

    return jsonResponse(
      {
        success: true,
        items: rows.length,
        items_total: rows.length,
        items_processed: ok + failed,
        items_succeeded: ok,
        items_failed: failed,
        flagged_for_review: flagged.length,
        dry_run: dryRun,
      },
      200,
      req,
    )
  } catch (err) {
    console.error('pipeline-safety-relevance:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
