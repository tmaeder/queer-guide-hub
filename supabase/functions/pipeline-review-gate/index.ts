import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Pipeline Review Gate Node
// Routes low-confidence items to human review queue,
// auto-approves high-confidence items.
//
// Hardened: review_queue inserts use the correct schema (entity_type,
// entity_id, review_type, status, details — NOT reason/source which were
// failing silently before the swallowed `.catch(() => {})` was removed).
// On insert failure the staging row is left pending so the next run retries.
// ============================================================

Deno.serve(withErrorReporting('pipeline-review-gate', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const entityType = body.entityType as string | undefined
    const minConfidence = body.minConfidence ?? 0.7
    const autoApproveAbove = body.autoApproveAbove ?? 0.9
    // Sweep mode (cron): re-gate rows already stuck in pending_review across
    // all runs, so items that gained an LLM verdict after being queued drain
    // without a human. Bigger default batch, never scoped to a pipeline run.
    const sweep = body.sweep === true
    const batchSize = body.batch_size || (sweep ? 200 : 50)
    const dryRun = body.dry_run || false
    // Social pipeline forces every row through human review. Set via the
    // node config { "force_review": true } in pipeline_definitions.
    const forceReview = body.force_review === true

    // Process both 'auto' items (first pass) and 'pending_review' items that
    // now have a quality_score and can be re-evaluated for auto-approval.
    let query = supabase
      .from('ingestion_staging')
      .select('id, ai_confidence_score, ai_validation_status, review_status, enriched_data, target_table, source_name, entity_type')
      .eq('ai_validation_status', 'approved')
      .in('review_status', sweep ? ['pending_review'] : ['auto', 'pending_review'])
      .eq('disposition', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId && !sweep) query = query.eq('pipeline_run_id', pipelineRunId)
    // Optional scoping (mirrors pipeline-validate / pipeline-deduplicate) so a
    // domain-specific drain (e.g. marketplace) doesn't advance other domains' rows.
    if (entityType) query = query.eq('entity_type', entityType)

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to review-gate' }, 200, req)
    }

    // Auto-downrank: load source_reliability for the (source, entity) pairs
    // present in this batch. Items from sources with weight < UNRELIABLE_THRESHOLD
    // are forced into review regardless of their combined score.
    const UNRELIABLE_THRESHOLD = 0.40
    const reliabilityKeys = Array.from(new Set(items
      .map(i => `${i.source_name ?? ''}|${i.entity_type ?? ''}`)
      .filter(k => k !== '|')))
    const reliabilityMap = new Map<string, number | null>()
    if (reliabilityKeys.length > 0) {
      const { data: relRows } = await supabase
        .from('source_reliability')
        .select('source_slug, entity_type, weight')
        .in('source_slug', Array.from(new Set(items.map(i => i.source_name).filter(Boolean) as string[])))
      for (const r of relRows ?? []) {
        reliabilityMap.set(`${r.source_slug}|${r.entity_type}`, r.weight)
      }
    }

    // Trust-based auto-approve: community submission items from users with
    // ≥ 5 approved and 0 rejected submissions can bypass review for minor edits.
    const TRUST_MIN_APPROVED = 5
    const trustMap = new Map<string, { approved: number; rejected: number }>()
    const trustOverrides = new Map<string, boolean>()
    const communityItems = items.filter(i => i.source_name === 'community-submissions')
    if (communityItems.length > 0 && !forceReview) {
      // Extract submitter user IDs from enriched_data or raw metadata
      const userIds = new Set<string>()
      for (const ci of communityItems) {
        const enriched = (ci.enriched_data || {}) as Record<string, unknown>
        const uid = (enriched.submitted_by as string) ?? null
        if (uid) userIds.add(uid)
      }
      if (userIds.size > 0) {
        const uidArr = Array.from(userIds)
        const { data: repRows } = await supabase
          .from('user_submission_reputation')
          .select('user_id, approved, rejected')
          .in('user_id', uidArr)
        for (const r of repRows ?? []) {
          trustMap.set(r.user_id, { approved: r.approved, rejected: r.rejected })
        }
        const { data: overrides } = await supabase
          .from('user_trust_overrides')
          .select('user_id, auto_approve')
          .in('user_id', uidArr)
        for (const o of overrides ?? []) {
          trustOverrides.set(o.user_id, o.auto_approve)
        }
        // Steward+ tier grants fast-track regardless of approved-count.
        const { data: tierRows } = await supabase
          .from('user_public_tiers')
          .select('user_id, tier')
          .in('user_id', uidArr)
        for (const t of tierRows ?? []) {
          if (t.tier === 'steward' || t.tier === 'guardian') {
            trustOverrides.set(t.user_id, true)
          }
        }
      }
    }

    function isMinorEdit(item: Record<string, unknown>): boolean {
      const enriched = (item.enriched_data || {}) as Record<string, unknown>
      const normalized = (item as Record<string, unknown>).normalized_data as Record<string, unknown> | undefined
      const data = normalized ?? enriched
      if (!data || typeof data !== 'object') return false
      const majorFields = ['name', 'title', 'latitude', 'longitude', 'city_id', 'country_id', 'address']
      for (const f of majorFields) {
        if (f in data) return false
      }
      return Object.keys(data).length <= 3
    }

    let approved = 0
    let sentToReview = 0
    let rejected = 0
    let failed = 0
    let trustAutoApproved = 0

    /** Route an item to human review. Inserts the review_queue row only on the
     * first transition (auto → pending_review); re-gated rows already have one.
     * Stamps enriched_data.review_reason so the admin UI can show WHY. */
    async function sendToReview(
      item: { id: string; review_status: string; target_table: string | null },
      enriched: Record<string, unknown>,
      reason: string,
      details: Record<string, unknown>,
    ): Promise<boolean> {
      if (dryRun) return true
      if (item.review_status !== 'pending_review') {
        const { error: rqErr } = await supabase.from('review_queue').insert({
          entity_type: 'ingestion_staging',
          entity_id:   item.id,
          review_type: reason,
          status:      'pending',
          details: { ...details, target_table: item.target_table, source: 'pipeline-review-gate' },
        })
        if (rqErr) {
          console.error(`review_queue insert ${item.id}: ${rqErr.message}`)
          await supabase.from('ingestion_staging').update({
            error_message: `review_gate: review_queue insert failed: ${rqErr.message}`,
          }).eq('id', item.id)
          return false
        }
      }
      if (item.review_status === 'pending_review' && enriched.review_reason === reason) {
        return true // already routed with the same reason — nothing to write
      }
      const { error: updErr } = await supabase
        .from('ingestion_staging')
        .update({
          review_status: 'pending_review',
          enriched_data: { ...enriched, review_reason: reason },
        })
        .eq('id', item.id)
      if (updErr) {
        console.error(`staging update ${item.id}: ${updErr.message}`)
        return false
      }
      return true
    }

    for (const item of items) {
      const confidence = item.ai_confidence_score || 0
      const enriched = (item.enriched_data || {}) as Record<string, unknown>
      const qualityScore = enriched.quality_score as number | undefined

      // Graceful fallback: when no completeness score exists (the scorer node
      // didn't run for this row's class), gate on confidence alone instead of
      // silently zeroing the 40% quality weight — that zeroing used to dump
      // entire pipelines (all news) into human review at confidence 1.0.
      const combinedScore = typeof qualityScore === 'number'
        ? (confidence * 0.6) + (qualityScore / 100 * 0.4)
        : confidence

      const relWeight = reliabilityMap.get(`${item.source_name ?? ''}|${item.entity_type ?? ''}`)
      const lowReliability = typeof relWeight === 'number' && relWeight < UNRELIABLE_THRESHOLD

      // Trust-based auto-approve for community submissions (runs before
      // the main score-based gate so trusted submitters can skip review).
      if (item.source_name === 'community-submissions' && !forceReview && !dryRun) {
        const uid = (enriched.submitted_by as string) ?? null
        if (uid) {
          const override = trustOverrides.get(uid)
          const rep = trustMap.get(uid)
          const stewardFastTrack = override === true && (!rep || rep.rejected === 0)
          if ((stewardFastTrack || (override !== false && rep && rep.approved >= TRUST_MIN_APPROVED && rep.rejected === 0)) && isMinorEdit(item as unknown as Record<string, unknown>)) {
            const { error: e } = await supabase
              .from('ingestion_staging')
              .update({
                review_status: 'approved',
                review_notes: `Auto-approved: trusted submitter (${rep.approved} approved, 0 rejected)`,
              })
              .eq('id', item.id)
            if (!e) { approved++; trustAutoApproved++; continue }
          }
        }
      }

      // LLM verdict path: pipeline-quality-enhance already judged this row
      // (relevance + quality + publish gate). Consume its verdict instead of
      // re-deriving from completeness — this IS the LLM relevance gate.
      const qualityStatus = enriched.quality_status as string | undefined
      const relevance = enriched.relevance_score as number | undefined
      if (qualityStatus === 'rejected') {
        if (!dryRun) {
          const { error: e } = await supabase
            .from('ingestion_staging')
            .update({
              review_status: 'rejected',
              disposition: 'rejected',
              review_notes: `auto: LLM relevance/quality rejected (relevance ${relevance ?? 'n/a'})`,
            })
            .eq('id', item.id)
          if (e) { failed++; console.error(`reject ${item.id}: ${e.message}`); continue }
        }
        rejected++
        continue
      }
      if (qualityStatus && enriched.auto_publish === true && !lowReliability && !forceReview) {
        if (!dryRun) {
          const { error: e } = await supabase
            .from('ingestion_staging')
            .update({ review_status: 'approved' })
            .eq('id', item.id)
          if (e) { failed++; console.error(`approve ${item.id}: ${e.message}`); continue }
        }
        approved++
        continue
      }
      if (qualityStatus) {
        // 'review', or 'passed' with the publish gate blocked — a human call.
        const blocked = enriched.auto_publish_blocked_reasons
        const reason = qualityStatus === 'review' ? 'llm_needs_review' : 'auto_publish_blocked'
        const ok = await sendToReview(item, enriched, reason, {
          combined_score: combinedScore, confidence, relevance_score: relevance ?? null,
          blocked_reasons: blocked ?? null,
        })
        ok ? sentToReview++ : failed++
        continue
      }
      if (item.target_table === 'news_articles') {
        // No LLM verdict yet (quality-enhance pending/failed for this row).
        // Hold for the verdict rather than confidence-approving past the
        // relevance gate; the sweep re-gates it once the verdict lands.
        const ok = await sendToReview(item, enriched, 'awaiting_llm_verdict', {
          combined_score: combinedScore, confidence,
        })
        ok ? sentToReview++ : failed++
        continue
      }

      if (combinedScore >= autoApproveAbove && !lowReliability && !forceReview) {
        if (!dryRun) {
          const { error: e } = await supabase
            .from('ingestion_staging')
            .update({ review_status: 'approved' })
            .eq('id', item.id)
          if (e) { failed++; console.error(`approve ${item.id}: ${e.message}`); continue }
        }
        approved++
      } else if (forceReview || combinedScore < minConfidence || lowReliability) {
        const reason = forceReview ? 'force_review'
          : lowReliability ? 'low_source_reliability'
          : 'low_confidence'
        const ok = await sendToReview(item, enriched, reason, {
          combined_score: combinedScore,
          confidence,
          quality_score: qualityScore ?? null,
          source_reliability_weight: relWeight ?? null,
        })
        ok ? sentToReview++ : failed++
      } else {
        if (!dryRun) {
          const { error: e } = await supabase
            .from('ingestion_staging')
            .update({ review_status: 'approved' })
            .eq('id', item.id)
          if (e) { failed++; console.error(`auto-approve ${item.id}: ${e.message}`); continue }
        }
        approved++
      }
    }

    return jsonResponse({
      success: true,
      items: approved,
      items_total: items.length,
      items_processed: approved + sentToReview + failed,
      items_succeeded: approved,
      items_failed: failed,
      approved,
      trust_auto_approved: trustAutoApproved,
      sent_to_review: sentToReview,
      rejected,
      sweep,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-review-gate error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
