import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline DLQ Consumer
// Claims a batch from public.ingestion_dlq (FOR UPDATE SKIP LOCKED via dlq_claim_batch),
// re-invokes the appropriate pipeline-* edge function for each item, and
// resolves / re-fails each row using exponential backoff (handled in DB).
//
// Triggered by:
//   - cron (workflow-dispatcher) — recommended every 1m
//   - manual POST from admin UI ("Retry now")
// ============================================================

const STAGE_TO_FN: Record<string, string> = {
  normalize:    'pipeline-normalize',
  validate:     'pipeline-validate',
  deduplicate:  'pipeline-deduplicate',
  enrich:       'enrich-venue',
  quality:      'pipeline-quality-score',
  review:       'pipeline-review-gate',
  commit:       'pipeline-commit',
}

interface DlqRow {
  id: number
  staging_id: string | null
  source_slug: string | null
  stage: string
  attempts: number
  payload: Record<string, unknown> | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const limit  = Math.min(Math.max(Number(body.limit ?? 25), 1), 100)
    const worker = String(body.worker ?? 'dlq-consumer')

    const { data: claimed, error: claimErr } = await supabase.rpc('dlq_claim_batch', {
      p_limit: limit, p_worker: worker,
    })
    if (claimErr) return errorResponse(`claim: ${claimErr.message}`, 500, req)

    const rows = (claimed ?? []) as DlqRow[]
    if (rows.length === 0) {
      return jsonResponse({ success: true, claimed: 0, message: 'dlq empty' }, 200, req)
    }

    let resolved = 0, failed = 0
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const MAX_ATTEMPTS = 8

    for (const row of rows) {
      // Escalate to permanent failure after max attempts
      if (row.attempts >= MAX_ATTEMPTS) {
        await supabase.from('ingestion_dlq').update({
          status: 'permanent_failed',
          error_message: `max retries exceeded (${row.attempts} attempts)`,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        failed++
        continue
      }

      const fn = STAGE_TO_FN[row.stage]
      if (!fn) {
        // Unknown stage — permanent failure, not retryable
        await supabase.from('ingestion_dlq').update({
          status: 'permanent_failed',
          error_message: `unknown_stage: ${row.stage}`,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        failed++
        continue
      }

      try {
        // Re-invoke the stage edge function targeting the specific staging id.
        const payload = {
          staging_id:  row.staging_id,
          batch_size:  1,
          retry:       true,
          attempt:     row.attempts,
          source_slug: row.source_slug,
          ...(row.payload ?? {}),
        }
        const res = await fetch(`${supaUrl}/functions/v1/${fn}`, {
          method:  'POST',
          headers: {
            'content-type':  'application/json',
            'authorization': `Bearer ${supaKey}`,
          },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          await supabase.rpc('dlq_fail', { p_id: row.id, p_err: `http_${res.status}: ${txt.slice(0, 400)}` })
          failed++
          continue
        }

        const out = await res.json().catch(() => ({})) as { items_failed?: number; success?: boolean; error?: string }
        if (out.success === false || (out.items_failed ?? 0) > 0) {
          await supabase.rpc('dlq_fail', { p_id: row.id, p_err: String(out.error ?? 'stage_reported_failure').slice(0, 400) })
          failed++
        } else {
          await supabase.rpc('dlq_resolve', { p_id: row.id })
          resolved++
        }
      } catch (e) {
        await supabase.rpc('dlq_fail', { p_id: row.id, p_err: (e as Error).message.slice(0, 400) })
        failed++
      }
    }

    return jsonResponse({
      success:  true,
      claimed:  rows.length,
      resolved,
      failed,
    }, 200, req)
  } catch (e) {
    console.error('pipeline-dlq-consumer:', e)
    return errorResponse((e as Error).message, 500, req)
  }
})
