import { getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { processQualityLogoJobs } from '../_shared/logo-quality-worker.ts'
import { logoMirrorConfigured } from '../_shared/logo-mirror.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const db = getServiceClient()
  const auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  try {
    const body = await req.json().catch(() => ({}))
    const table = typeof body.table === 'string' ? body.table : 'all'
    const batchSize = Math.max(1, Math.min(4, Math.trunc(Number(body.batch_size) || 4)))
    const dryRun = body.dry_run === true
    if (!dryRun && !logoMirrorConfigured()) return errorResponse('logo_mirror_unconfigured', 503, req)
    return jsonResponse(await processQualityLogoJobs(db, table, batchSize, dryRun), 200, req)
  } catch (e) {
    console.error('logo-quality-repair', (e as Error).message)
    return errorResponse('logo_quality_failed', 500, req)
  }
})
