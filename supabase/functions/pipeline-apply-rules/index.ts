import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import {
  evaluateRule,
  applyRuleActions,
  type Rule,
  type RuleSubmission as Submission,
} from '../_shared/ingestion-rules.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// pipeline-apply-rules
// ------------------------------------------------------------
// Pipeline node. Evaluates active ingestion_rules against each
// submission's combined text (raw_text + ocr_text + vision_summary
// + transcript_text). On match: applies actions (labels, priority,
// status, permission, force_review) and writes a hit row.
// ============================================================

Deno.serve(withErrorReporting('pipeline-apply-rules', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST only', 405, req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const explicitIds = Array.isArray(body.submission_ids)
      ? (body.submission_ids as string[])
      : null
    const batchSize = Number(body.batch_size) || 50

    let submissionIds: string[]
    if (explicitIds) {
      submissionIds = explicitIds
    } else {
      // Pipeline mode: scan recent pending rows that have at least
      // some text to evaluate against. Idempotent on re-run (actions
      // are merge-safe).
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      const { data: scan, error: scanErr } = await supabase
        .from('community_submissions')
        .select('id')
        .eq('status', 'pending')
        .gte('submitted_at', since)
        .order('submitted_at', { ascending: false })
        .limit(batchSize)
      if (scanErr) return errorResponse(`scan: ${scanErr.message}`, 500, req)
      submissionIds = (scan ?? []).map((r) => r.id as string)
    }

    if (submissionIds.length === 0) {
      return jsonResponse({ success: true, processed: 0, hits: 0 }, 200, req)
    }

    const { data: rules, error: rulesErr } = await supabase
      .from('ingestion_rules')
      .select('id, name, enabled, priority, match, actions')
      .eq('enabled', true)
      .order('priority', { ascending: true })
    if (rulesErr) return errorResponse(`rules: ${rulesErr.message}`, 500, req)

    if (!rules?.length) {
      return jsonResponse({ success: true, processed: submissionIds.length, hits: 0 }, 200, req)
    }

    const { data: subs, error: subsErr } = await supabase
      .from('community_submissions')
      .select(
        'id, platform, status, priority, labels, permission_level, raw_text, ocr_text, vision_summary, transcript_text',
      )
      .in('id', submissionIds)
    if (subsErr) return errorResponse(`submissions: ${subsErr.message}`, 500, req)

    let hitCount = 0
    for (const s of (subs ?? []) as Submission[]) {
      let mutated: Submission = { ...s }
      const hits: Array<{
        rule_id: string
        submission_id: string
        matched_terms: { terms: string[] }
        applied_actions: Record<string, unknown>
      }> = []

      for (const rule of rules as Rule[]) {
        const { matched, terms } = evaluateRule(rule, mutated)
        if (!matched) continue
        const { patch, applied } = applyRuleActions(mutated, rule.actions || {})
        if (Object.keys(patch).length === 0) continue
        const { error: upErr } = await supabase
          .from('community_submissions')
          .update(patch)
          .eq('id', s.id)
        if (upErr) {
          console.error(`apply-rules ${rule.id} on ${s.id}:`, upErr.message)
          continue
        }
        mutated = { ...mutated, ...patch } as Submission
        hits.push({
          rule_id: rule.id,
          submission_id: s.id,
          matched_terms: { terms },
          applied_actions: applied,
        })
      }

      if (hits.length) {
        const { error: hitErr } = await supabase.from('ingestion_rule_hits').insert(hits)
        if (hitErr) console.error('hits insert:', hitErr.message)
        hitCount += hits.length
      }
    }

    const processed = subs?.length ?? 0
    return jsonResponse(
      {
        success: true,
        processed,
        hits: hitCount,
        items: processed,
        items_processed: processed,
      },
      200,
      req,
    )
  } catch (err) {
    console.error('pipeline-apply-rules:', err)
    return errorResponse((err as Error).message, 500, req)
  }
}))
