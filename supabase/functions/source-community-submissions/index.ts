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

    const { data: rows, error } = await supabase
      .from('community_submissions')
      .select('id, content_type, data, submitted_by, flyer_scan_id')
      .eq('status', 'pending')
      .in('content_type', ['event', 'venue'])
      .not('data', 'is', null)
      .order('submitted_at', { ascending: true })
      .limit(batchLimit)

    if (error) return errorResponse(error.message, 500, req)
    if (!rows?.length) {
      return jsonResponse({ success: true, skipped: true, reason: 'nothing to stage', items: 0 }, 200, req)
    }

    const stagingRows: Record<string, unknown>[] = []
    const stagedIds: string[] = []

    for (const row of rows) {
      const targetTable = row.content_type === 'event' ? 'events' : 'venues'
      stagingRows.push({
        source_type:     'community-submission',
        target_table:    targetTable,
        raw_data:        {
          ...((row.data as Record<string, unknown>) ?? {}),
          _submission_id:  row.id,
          _submitted_by:   row.submitted_by,
          _flyer_scan_id:  row.flyer_scan_id ?? null,
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
