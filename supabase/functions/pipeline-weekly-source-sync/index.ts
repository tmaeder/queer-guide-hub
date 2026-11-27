import { getServiceClient, requireInternalOrAdmin, corsResponse, errorResponse } from '../_shared/supabase-client.ts'
import { WEEKLY_PIPELINE } from './contracts.ts'
import { startWeeklySourceSync, continueWeeklySourceSync } from './runtime.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST required', 405, req)
  const client = getServiceClient()
  const auth = await requireInternalOrAdmin(req, client)
  if (auth instanceof Response) return auth
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('JSON object required', 400, req)
  if (body.pipeline_run_id) {
    const { data: run } = await client.from('pipeline_runs').select('id,pipeline_name,context')
      .eq('id', body.pipeline_run_id).maybeSingle()
    if (!run || run.pipeline_name !== WEEKLY_PIPELINE) return errorResponse('Weekly run not found', 404, req)
    return continueWeeklySourceSync(client, run, String(body.current_node_id ?? body.node_id ?? ''), req)
  }
  const { data: pipeline } = await client.from('pipeline_definitions').select('id,name,default_context')
    .eq('name', WEEKLY_PIPELINE).maybeSingle()
  if (!pipeline) return errorResponse('Weekly pipeline not found', 404, req)
  return startWeeklySourceSync(client, pipeline, body, req)
})
