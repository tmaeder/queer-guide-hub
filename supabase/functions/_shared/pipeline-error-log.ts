// Lightweight error logger for pipeline edge functions.
// Writes to public.pipeline_errors; safe to call in catch blocks (never throws).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export interface PipelineErrorCtx {
  pipeline_run_id?: string | null
  staging_id?: string | null
  severity?: 'info' | 'warn' | 'error' | 'fatal'
  context?: Record<string, unknown>
}

export async function logPipelineError(
  supabase: SupabaseClient,
  functionName: string,
  err: unknown,
  opts: PipelineErrorCtx = {},
): Promise<void> {
  try {
    const e = err as Error
    const msg = e?.message ?? String(err)
    await supabase.from('pipeline_errors').insert({
      function_name: functionName,
      severity: opts.severity ?? 'error',
      message: msg.slice(0, 2000),
      stack: e?.stack?.slice(0, 4000) ?? null,
      context: opts.context ?? null,
      pipeline_run_id: opts.pipeline_run_id ?? null,
      staging_id: opts.staging_id ?? null,
    })
  } catch {
    // best-effort — never let error logging break the pipeline
  }
}
