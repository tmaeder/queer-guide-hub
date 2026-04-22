import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Stages AI-extracted events/venues from email_ingestions into ingestion_staging
// so they flow through normalize → validate → dedup → enrich → quality → commit.
// The email-ingest CF worker already does fast-path direct inserts;
// pipeline dedup catches duplicates and merges/skips as appropriate.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchLimit = Math.min(body.batchLimit ?? 100, 500)
    const dryRun     = body.dry_run === true
    const pipelineRunId = body.pipeline_run_id ?? null
    const nodeId        = body.node_id ?? null

    // Fetch unstaged completed email ingestions
    const { data: rows, error } = await supabase
      .from('email_ingestions')
      .select('id, from_address, subject, ai_extraction, received_at')
      .eq('status', 'completed')
      .not('ai_extraction', 'is', null)
      .is('pipeline_staged_at', null)
      .order('received_at', { ascending: true })
      .limit(batchLimit)

    if (error) return errorResponse(error.message, 500, req)
    if (!rows?.length) {
      return jsonResponse({ success: true, skipped: true, reason: 'nothing to stage', items: 0 }, 200, req)
    }

    const stagingRows: Record<string, unknown>[] = []
    const stagedIds: string[] = []

    for (const row of rows) {
      const extraction = row.ai_extraction as {
        events?: Record<string, unknown>[]
        venues?: Record<string, unknown>[]
        summary?: string
      }
      const events  = extraction?.events  ?? []
      const venues  = extraction?.venues  ?? []

      for (const evt of events) {
        stagingRows.push({
          source_type:      'email-ingest',
          target_table:     'events',
          raw_data:         { ...evt, _email_ingestion_id: row.id, _from: row.from_address, _subject: row.subject },
          job_id:           '00000000-0000-0000-0000-000000000000',
          pipeline_run_id:  pipelineRunId,
          node_id:          nodeId,
        })
      }

      for (const venue of venues) {
        stagingRows.push({
          source_type:      'email-ingest',
          target_table:     'venues',
          raw_data:         { ...venue, _email_ingestion_id: row.id, _from: row.from_address, _subject: row.subject },
          job_id:           '00000000-0000-0000-0000-000000000000',
          pipeline_run_id:  pipelineRunId,
          node_id:          nodeId,
        })
      }

      stagedIds.push(row.id)
    }

    if (!dryRun && stagingRows.length > 0) {
      const { error: insErr } = await supabase.from('ingestion_staging').insert(stagingRows)
      if (insErr && !insErr.message?.includes('duplicate key')) {
        return errorResponse(`staging insert failed: ${insErr.message}`, 500, req)
      }

      // Mark as staged
      const { error: updErr } = await supabase
        .from('email_ingestions')
        .update({ pipeline_staged_at: new Date().toISOString() })
        .in('id', stagedIds)
      if (updErr) console.error('failed to mark staged:', updErr.message)
    }

    return jsonResponse({
      success: true,
      items: stagingRows.length,
      items_total:     stagingRows.length,
      items_processed: stagingRows.length,
      items_succeeded: dryRun ? 0 : stagingRows.length,
      items_failed:    0,
      emails_processed: rows.length,
      dry_run: dryRun,
    }, 200, req)
  } catch (err) {
    console.error('source-email-ingestions:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
