// ============================================================
// stage-personality
// Admin-facing endpoint that routes a single personality payload
// through the bulletproof pipeline (staging → normalize → ... → commit).
// Replaces direct INSERTs from AddPersonalityDialog / createPersonality hook.
// ============================================================

import { getCorsHeaders, getServiceClient, requireAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { stagePersonality, triggerPersonalityPipeline, type RawPersonality } from '../_shared/personality-staging.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json() as { personality: RawPersonality; auto_run?: boolean; source_name?: string }
    if (!body?.personality?.name) {
      return errorResponse('Missing personality.name', 400, req)
    }

    const res = await stagePersonality(supabase, body.personality, {
      source_name: body.source_name || 'admin-manual',
      source_type: 'manual',
      source_entity_id: body.personality.wikidata_qid || null,
      actor: auth.userId,
    })

    let pipelineRunId: string | null = null
    let pipelineError: string | undefined
    if (body.auto_run !== false) {
      const trig = await triggerPersonalityPipeline(supabase, { triggered_by: `admin-manual:${auth.userId}`, batch_size: 5 })
      pipelineRunId = trig.pipeline_run_id
      pipelineError = trig.error
    }

    return jsonResponse({
      success: true,
      staging_id: res.staging_id,
      inserted: res.inserted,
      pipeline_run_id: pipelineRunId,
      pipeline_error: pipelineError,
    }, 200, req)
  } catch (error) {
    console.error('stage-personality error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
