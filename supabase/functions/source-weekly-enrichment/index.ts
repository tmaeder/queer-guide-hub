import { getServiceClient, requireInternalOrAdmin, jsonResponse, corsResponse, errorResponse } from '../_shared/supabase-client.ts'
import { MissingCredentialsError, InvalidCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { refreshSource, ImageProviderRateLimitError } from './refresh.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST required', 405, req)
  const db = getServiceClient(), auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.source_id !== 'string') return errorResponse('source_id required', 400, req)
  const { data: source, error } = await db.from('ingestion_sources').select('id,slug,config,updated_at,is_enabled').eq('id', body.source_id).maybeSingle()
  if (error) return errorResponse('source_lookup_failed', 500, req)
  if (!source || !['wikipedia', 'pexels'].includes(source.slug)) return errorResponse('Unknown enrichment source', 404, req)
  if (!source.is_enabled) return jsonResponse({ success: true, skipped: true, reason: 'Source is disabled' }, 200, req)
  try {
    return jsonResponse(await refreshSource(db, source, body, name => Deno.env.get(name)), 200, req)
  } catch (failure) {
    if (failure instanceof ImageProviderRateLimitError) return errorResponse(failure.message, 429, req)
    if (failure instanceof MissingCredentialsError || failure instanceof InvalidCredentialsError)
      return jsonResponse(skippedResponse(failure instanceof InvalidCredentialsError ? 'invalid_credentials' : 'missing_credentials', failure.missing), 200, req)
    console.error('Weekly enrichment source failed', failure instanceof Error ? failure.name : 'unknown')
    return errorResponse('Weekly enrichment provider is unavailable; retry this source', 503, req)
  }
})
