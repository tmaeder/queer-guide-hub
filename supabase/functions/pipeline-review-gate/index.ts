import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
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

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const minConfidence = body.minConfidence ?? 0.7
    const autoApproveAbove = body.autoApproveAbove ?? 0.9
    const batchSize = body.batch_size || 50
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
      .in('review_status', ['auto', 'pending_review'])
      .eq('disposition', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)

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
    let failed = 0
    let trustAutoApproved = 0

    for (const item of items) {
      const confidence = item.ai_confidence_score || 0
      const enriched = (item.enriched_data || {}) as Record<string, unknown>
      const qualityScore = (enriched.quality_score as number) ?? 0

      const combinedScore = (confidence * 0.6) + (qualityScore / 100 * 0.4)

      const relWeight = reliabilityMap.get(`${item.source_name ?? ''}|${item.entity_type ?? ''}`)
      const lowReliability = typeof relWeight === 'number' && relWeight < UNRELIABLE_THRESHOLD

      // Trust-based auto-approve for community submissions
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
        if (!dryRun) {
          // Hard-fail review_queue insert: no swallowed errors. If the insert
          // fails, leave the row in 'auto' so the next run retries.
          const { error: rqErr } = await supabase.from('review_queue').insert({
            entity_type: 'ingestion_staging',
            entity_id:   item.id,
            review_type: lowReliability ? 'low_source_reliability' : 'low_confidence',
            status:      'pending',
            details: {
              combined_score: combinedScore,
              confidence,
              quality_score: qualityScore,
              source_reliability_weight: relWeight ?? null,
              target_table: item.target_table,
              source: 'pipeline-review-gate',
            },
          })
          if (rqErr) {
            console.error(`review_queue insert ${item.id}: ${rqErr.message}`)
            await supabase.from('ingestion_staging').update({
              error_message: `review_gate: review_queue insert failed: ${rqErr.message}`,
            }).eq('id', item.id)
            failed++
            continue
          }

          const { error: updErr } = await supabase
            .from('ingestion_staging')
            .update({ review_status: 'pending_review' })
            .eq('id', item.id)
          if (updErr) {
            // review_queue row exists but staging update failed — log loudly.
            // Next run will see the orphan and resolve.
            console.error(`staging update ${item.id}: ${updErr.message}`)
            failed++
            continue
          }
        }
        sentToReview++
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
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-review-gate error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
