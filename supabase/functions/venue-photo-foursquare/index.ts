// Retired bulk writer: its first nearby search hit did not establish identity,
// its 400px photos failed cover quality, and requesting Premium photos bypassed
// the Pro free-tier budget. Keep an explicit terminal response for old drivers.
import { getServiceClient, getCorsHeaders, corsResponse, requireAdmin } from '../_shared/supabase-client.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' },
  })
  const auth = await requireAdmin(req, getServiceClient())
  if (auth instanceof Response) return auth
  return new Response(JSON.stringify({
    error: 'Unsafe Foursquare photo backfill retired; use the ordinary venue image enrichment and audit workers.',
    code: 'photo_backfill_retired', done: true, processed: 0, found: 0,
  }), { status: 410, headers })
})
