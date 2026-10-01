// Foursquare Photos and any Places Search/Details request containing `photos`
// are Premium and have no free-call allowance. Keep this formerly scheduled
// function as an authenticated, explicit no-op so stale DAG/config references
// cannot create paid usage.
import {
  corsResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const auth = await requireInternalOrAdmin(req, getServiceClient())
  if (auth instanceof Response) return auth
  return jsonResponse({
    success: true,
    skipped: true,
    reason: 'foursquare_photos_are_premium',
    zero_spend_policy: true,
    processed: 0,
    found: 0,
  }, 200, req)
})
