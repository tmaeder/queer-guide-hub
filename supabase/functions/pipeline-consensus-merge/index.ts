import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import {
  runConsensus,
  evaluateClosure,
  closureSignal,
  sourceWeight,
  VENUE_FIELDS,
  getPath,
  type SourceRecord,
  type ClosureSignal,
} from '../_shared/venue-consensus.ts'

// ============================================================
// Pipeline Consensus Merge Node (Venue Truth Engine)
// Runs after dedup, before enrich. Groups staging rows that
// dedup linked to the same existing venue (dedup_match_id),
// votes each field across sources + the venue's current value,
// writes per-field provenance + confidence + an audit trail,
// and folds the winning values back into the primary row's
// normalized_data so downstream commit persists the merged truth.
// ============================================================

type Json = Record<string, unknown>

// Fields whose unresolved conflict must NOT auto-commit — route to human triage.
// Low-risk fields (tags/images are unioned; description/hours pick best source)
// flow through automatically per the lean auto-commit-high-confidence policy.
const HIGH_RISK_FIELDS = new Set(['name', 'latitude', 'longitude', 'category'])

function setPath(obj: Json, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur: Json = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
    cur = cur[k] as Json
  }
  const last = keys[keys.length - 1]
  if (last === '__proto__' || last === 'constructor' || last === 'prototype') return
  cur[last] = value
}

Deno.serve(withErrorReporting('pipeline-consensus-merge', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const cfg = { ...body, ...((body.config as Json) || {}) }
    const pipelineRunId = (cfg.pipeline_run_id as string) || null
    const batchSize = (cfg.batch_size as number) || 100
    const autoThreshold = (cfg.auto_threshold as number) ?? 0.85
    const dryRun = Boolean(cfg.dry_run)

    // Load venue staging rows that have cleared dedup but not consensus yet.
    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, source_name, dedup_match_id, dedup_status, target_table, entity_type')
      .eq('target_table', 'venues')
      .eq('disposition', 'pending')
      .neq('dedup_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)

    const { data: rows, error } = await query
    if (error) return errorResponse(`load staging: ${error.message}`, 500, req)
    if (!rows || rows.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'no rows for consensus' }, 200, req)
    }

    const pending = rows.filter(
      (r) => ((r.enriched_data as Json)?.consensus_done) !== true,
    )

    // Group by the existing venue dedup linked them to. Rows without a match
    // (brand-new venues) are single-source: stamp source-weight confidence and
    // pass through — provenance accrues once the venue exists (refresh loop).
    const groups = new Map<string, typeof pending>()
    const singles: typeof pending = []
    for (const r of pending) {
      if (r.dedup_match_id) {
        const key = String(r.dedup_match_id)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(r)
      } else {
        singles.push(r)
      }
    }

    let merged = 0
    let provenanceRows = 0
    let auditRows = 0
    let closuresFlagged = 0
    const nowIso = new Date().toISOString()

    // --- single-source new venues: stamp confidence, no provenance yet ---
    for (const r of singles) {
      const nd = (r.normalized_data || {}) as Json
      const conf: Json = {}
      for (const spec of VENUE_FIELDS) {
        if (getPath(nd, spec.path) !== undefined && getPath(nd, spec.path) !== null) {
          conf[spec.field] = sourceWeight(r.source_name || 'llm')
        }
      }
      if (!dryRun) {
        await supabase.from('ingestion_staging').update({
          enriched_data: {
            ...(r.enriched_data as Json || {}),
            consensus_done: true,
            field_confidence: conf,
            consensus: { sources: [r.source_name], single_source: true },
          },
          updated_at: nowIso,
        }).eq('id', r.id)
      }
      merged++
    }

    // --- matched groups: full cross-source consensus ---
    for (const [venueId, members] of groups) {
      const { data: venue } = await supabase
        .from('venues')
        .select('name, description, website, phone, email, latitude, longitude, address, city, country, category, hours, tags, images, lgbti_relevance_score, data_source')
        .eq('id', venueId)
        .maybeSingle()

      // Build source records: each staging row + the venue's current value.
      const sources: SourceRecord[] = members.map((m) => ({
        source: m.source_name || 'unknown',
        data: (m.normalized_data || {}) as Json,
      }))
      if (venue) {
        sources.push({
          source: 'existing',
          data: {
            name: venue.name,
            description: venue.description,
            category: venue.category,
            hours: venue.hours,
            tags: venue.tags,
            images: venue.images,
            lgbti_relevance_score: venue.lgbti_relevance_score,
            location: { lat: venue.latitude, lng: venue.longitude, address: venue.address, city: venue.city, country: venue.country },
            contacts: { website: venue.website, phone: venue.phone, email: venue.email },
          },
        })
      }

      const decisions = runConsensus(sources, autoThreshold)

      // Closure signals across sources.
      const closureSignals: ClosureSignal[] = []
      for (const s of sources) {
        const sig = closureSignal(s.source, s.data)
        if (sig) closureSignals.push(sig)
      }
      const closure = evaluateClosure(closureSignals)
      if (closure.closed || closure.needsAttention) closuresFlagged++

      // Primary row = highest-trust source row (the one we commit through).
      const primary = [...members].sort((a, b) => sourceWeight(b.source_name || '') - sourceWeight(a.source_name || ''))[0]
      const mergedData = { ...((primary.normalized_data || {}) as Json) }
      const fieldConfidence: Json = {}

      const provBatch: Json[] = []
      const auditBatch: Json[] = []
      // Gate to triage iff a HIGH-RISK field has an unresolved conflict.
      let gateToReview = false

      for (const d of decisions) {
        if (d.action === 'triage' && d.conflicting.length > 0 && HIGH_RISK_FIELDS.has(d.field)) {
          gateToReview = true
        }
        const spec = VENUE_FIELDS.find((f) => f.field === d.field)!
        // Fold winning value back into the row we will commit.
        setPath(mergedData, spec.path, d.winner)
        fieldConfidence[d.field] = d.confidence

        // Provenance: one row per (field, source) that supplied a value.
        for (const s of sources) {
          const val = getPath(s.data, spec.path)
          if (val === undefined || val === null || val === '') continue
          provBatch.push({
            venue_id: venueId,
            field: d.field,
            value: val,
            source: s.source,
            confidence: d.agreeing.includes(s.source) ? d.confidence : Math.min(d.confidence, sourceWeight(s.source)),
            is_winning: s.source === d.winningSource,
            observed_at: nowIso,
          })
        }

        if (d.conflicting.length > 0 || d.action === 'triage') {
          auditBatch.push({
            venue_id: venueId,
            staging_id: primary.id,
            pipeline_run_id: pipelineRunId,
            field: d.field,
            winning_value: d.winner ?? null,
            winning_source: d.winningSource,
            confidence: d.confidence,
            agreeing_sources: d.agreeing,
            conflicting_sources: d.conflicting,
            action: d.action,
            details: {},
          })
        }
      }

      if (closure.closed || closure.needsAttention) {
        auditBatch.push({
          venue_id: venueId,
          staging_id: primary.id,
          pipeline_run_id: pipelineRunId,
          field: 'closed_at',
          winning_value: null,
          winning_source: closure.signals.map((s) => s.source).join(','),
          confidence: closure.closed ? 0.9 : 0.5,
          agreeing_sources: closure.signals.map((s) => s.source),
          conflicting_sources: [],
          action: 'closure_flag',
          details: { signals: closure.signals, auto_close: closure.closed },
        })
      }

      if (!dryRun) {
        // Provenance upsert (unique on venue_id, field, source).
        if (provBatch.length > 0) {
          const { error: pErr } = await supabase
            .from('venue_field_provenance')
            .upsert(provBatch, { onConflict: 'venue_id,field,source' })
          if (pErr) console.error(`provenance upsert ${venueId}:`, pErr.message)
          else provenanceRows += provBatch.length
        }
        if (auditBatch.length > 0) {
          const { error: aErr } = await supabase.from('venue_consensus_audit').insert(auditBatch)
          if (aErr) console.error(`audit insert ${venueId}:`, aErr.message)
          else auditRows += auditBatch.length
        }

        // Closure + freshness write directly to the existing venue (we hold its
        // id and high confidence). >=2 signals auto-close; 1 signal flags.
        const venueUpdate: Json = { last_refreshed_at: nowIso }
        if (closure.closed) {
          venueUpdate.closed_at = nowIso
          venueUpdate.needs_attention = true
        } else if (closure.needsAttention) {
          venueUpdate.needs_attention = true
        }
        await supabase.from('venues').update(venueUpdate).eq('id', venueId)

        // Auto-commit high-confidence; gate conflicts on high-risk fields or a
        // lone closure signal to human triage (existing review-gate respects this).
        const needsReview = gateToReview || closure.needsAttention
        await supabase.from('ingestion_staging').update({
          normalized_data: mergedData,
          ...(needsReview ? { review_status: 'pending_review' } : {}),
          enriched_data: {
            ...(primary.enriched_data as Json || {}),
            consensus_done: true,
            field_confidence: fieldConfidence,
            consensus: {
              sources: sources.map((s) => s.source),
              venue_id: venueId,
              gated: needsReview,
              closure: closure.closed ? 'auto_close' : closure.needsAttention ? 'flag' : null,
            },
          },
          updated_at: nowIso,
        }).eq('id', primary.id)

        // Sibling rows are superseded by the primary merge — archive them.
        const siblingIds = members.filter((m) => m.id !== primary.id).map((m) => m.id)
        if (siblingIds.length > 0) {
          await supabase.from('ingestion_staging').update({
            disposition: 'archived',
            enriched_data: { consensus_done: true, merged_into: primary.id },
            updated_at: nowIso,
          }).in('id', siblingIds)
        }
      }
      merged++
    }

    return jsonResponse({
      success: true,
      items: merged,
      items_processed: merged,
      groups: groups.size,
      singles: singles.length,
      provenance_rows: provenanceRows,
      audit_rows: auditRows,
      closures_flagged: closuresFlagged,
      dry_run: dryRun,
    }, 200, req)
  } catch (e) {
    console.error('pipeline-consensus-merge error:', e)
    return errorResponse((e as Error).message, 500, req)
  }
}))
