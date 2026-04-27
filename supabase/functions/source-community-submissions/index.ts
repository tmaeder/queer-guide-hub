import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Stages pending community_submissions (including flyer scan results) into
// ingestion_staging so they flow through the full pipeline.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchLimit  = Math.min(body.batchLimit ?? 100, 500)
    const dryRun      = body.dry_run === true
    const pipelineRunId = body.pipeline_run_id ?? null
    const nodeId        = body.node_id ?? null
    // Social-ingestion config: filter by platform AND require media+safety
    // pre-processing to have completed before staging.
    const platformIn = Array.isArray(body.platform_in) ? body.platform_in.filter((p: unknown) => typeof p === 'string') : null
    const requireRelevance = body.require_relevance_score === true

    let q = supabase
      .from('community_submissions')
      .select('id, content_type, data, submitted_by, flyer_scan_id, platform, sub_source_type, source_url, raw_text, ocr_text, vision_summary, transcript_text, media_urls, media_storage_paths, screenshot_paths, queer_relevance_score, confidence_score, safety_flags, sensitivity_level, permission_level, submitter_metadata')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
      .limit(batchLimit)

    if (platformIn?.length) {
      q = q.in('platform', platformIn)
    } else {
      // Legacy / non-social pipeline: keep the old behaviour (event/venue only).
      q = q.in('content_type', ['event', 'venue']).not('data', 'is', null)
    }

    if (requireRelevance) {
      q = q.in('media_processing_status', ['done', 'partial', 'skipped', 'not_applicable'])
        .not('queer_relevance_score', 'is', null)
    }

    const { data: rows, error } = await q

    if (error) return errorResponse(error.message, 500, req)
    if (!rows?.length) {
      return jsonResponse({ success: true, skipped: true, reason: 'nothing to stage', items: 0 }, 200, req)
    }

    const stagingRows: Record<string, unknown>[] = []
    const stagedIds: string[] = []

    for (const row of rows) {
      // Default to events when content_type is null (social-ingestion path —
      // extraction will refine after dedup).
      const targetTable = row.content_type === 'venue' ? 'venues' : 'events'
      stagingRows.push({
        source_type:     row.platform ? `community-${row.platform}` : 'community-submission',
        target_table:    targetTable,
        raw_data:        {
          ...((row.data as Record<string, unknown>) ?? {}),
          _submission_id:  row.id,
          _submitted_by:   row.submitted_by,
          _flyer_scan_id:  row.flyer_scan_id ?? null,
          // Media-aware fields propagated to downstream pipeline nodes.
          _platform:                  row.platform ?? null,
          _sub_source_type:           row.sub_source_type ?? null,
          _source_url:                row.source_url ?? null,
          _raw_text:                  row.raw_text ?? null,
          _ocr_text:                  row.ocr_text ?? null,
          _vision_summary:            row.vision_summary ?? null,
          _transcript_text:           row.transcript_text ?? null,
          _media_urls:                row.media_urls ?? null,
          _media_storage_paths:       row.media_storage_paths ?? null,
          _screenshot_paths:          row.screenshot_paths ?? null,
          _queer_relevance_score:     row.queer_relevance_score ?? null,
          _confidence_score:          row.confidence_score ?? null,
          _safety_flags:              row.safety_flags ?? [],
          _sensitivity_level:         row.sensitivity_level ?? null,
          _permission_level:          row.permission_level ?? null,
          _submitter_metadata:        row.submitter_metadata ?? null,
        },
        job_id:          '00000000-0000-0000-0000-000000000000',
        pipeline_run_id: pipelineRunId,
        node_id:         nodeId,
      })
      stagedIds.push(row.id)
    }

    if (!dryRun && stagingRows.length > 0) {
      const { error: insErr } = await supabase.from('ingestion_staging').insert(stagingRows)
      if (insErr && !insErr.message?.includes('duplicate key')) {
        return errorResponse(`staging insert failed: ${insErr.message}`, 500, req)
      }

      const { error: updErr } = await supabase
        .from('community_submissions')
        .update({ status: 'processing' })
        .in('id', stagedIds)
      if (updErr) console.error('failed to mark processing:', updErr.message)
    }

    return jsonResponse({
      success: true,
      items: stagingRows.length,
      items_total:     stagingRows.length,
      items_processed: stagingRows.length,
      items_succeeded: dryRun ? 0 : stagingRows.length,
      items_failed:    0,
      dry_run: dryRun,
    }, 200, req)
  } catch (err) {
    console.error('source-community-submissions:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
