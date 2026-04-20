import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts'

interface FlagImageRequest {
  kind: 'city' | 'country'
  id?: string
  slug?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, req)
  }

  const service = getServiceClient()
  const auth = await requireAdmin(req, service)
  if (auth instanceof Response) return auth

  let body: FlagImageRequest
  try {
    body = (await req.json()) as FlagImageRequest
  } catch {
    return errorResponse('Invalid JSON body', 400, req)
  }

  if (body.kind !== 'city' && body.kind !== 'country') {
    return errorResponse('kind must be "city" or "country"', 400, req)
  }
  if (!body.id && !body.slug) {
    return errorResponse('id or slug is required', 400, req)
  }

  const table = body.kind === 'city' ? 'cities' : 'countries'
  const query = service
    .from(table)
    .update({ image_flagged: true, image_url: null })
    .select('id, slug, image_flagged, image_url')

  const { data, error } = body.id
    ? await query.eq('id', body.id)
    : await query.eq('slug', body.slug!)

  if (error) return errorResponse(error.message, 500, req)
  if (!data || data.length === 0) {
    return errorResponse('Not found', 404, req)
  }

  return jsonResponse({ success: true, flagged: data }, 200, req)
})
