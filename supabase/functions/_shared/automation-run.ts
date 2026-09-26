import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export type AutomationRunStatus = 'success' | 'partial' | 'error'

export interface AutomationRunResult {
  slug: string
  status: AutomationRunStatus
  startedAt?: string | Date
  itemsExamined?: number
  itemsChanged?: number
  summary?: Record<string, unknown>
  error?: string
}

function canonicalRunId(req: Request): number | null {
  const raw = req.headers.get('x-automation-run-id')?.trim()
  if (!raw || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * Finalize the run opened by the scheduler. Direct/manual invocations have no
 * scheduler header, so the RPC creates and finalizes one self-owned row.
 * Database-side row locking makes retries and reaper races idempotent.
 */
export async function finalizeAutomationRun(
  req: Request,
  supabase: SupabaseClient,
  result: AutomationRunResult,
): Promise<void> {
  const startedAt = result.startedAt instanceof Date
    ? result.startedAt.toISOString()
    : result.startedAt ?? null

  const { error } = await supabase.rpc('admin_automation_finalize_run', {
    p_slug: result.slug,
    p_status: result.status,
    p_run_id: canonicalRunId(req),
    p_started_at: startedAt,
    p_items_examined: Math.max(0, result.itemsExamined ?? 0),
    p_items_changed: Math.max(0, result.itemsChanged ?? 0),
    p_summary: result.summary ?? {},
    p_error: result.error ?? null,
  })

  if (error) {
    console.error(`automation run finalization failed for ${result.slug}: ${error.message}`)
  }
}

