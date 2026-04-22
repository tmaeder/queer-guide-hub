import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Source: Personality Staging — reports personalities already in ingestion_staging
// (put there by admin via stage-personality or import-personalities-csv).
// The pipeline-executor picks them up in subsequent normalize/validate/commit nodes.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run || false

    const { count, error } = await supabase
      .from('ingestion_staging')
      .select('*', { count: 'exact', head: true })
      .eq('entity_type', 'personality')
      .eq('disposition', 'pending')

    if (error) throw new Error(error.message)

    const pending = count ?? 0

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      items: pending,
      items_total: pending,
      items_processed: pending,
      items_succeeded: pending,
      items_failed: 0,
      message: `${pending} personalities pending in staging`,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
