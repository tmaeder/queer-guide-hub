// report-existence — community "this no longer exists" signal.
//
// A signed-in user reports that a venue / event / product is gone. We record a
// LOW-WEIGHT community_life dead signal into the existence ledger. Per the
// conservative engine, a single community vote NEVER archives anything — it needs
// corroboration (>=2 strong signals or an admin). Rate-limited to deter abuse.
//
// verify_jwt=true (gateway guarantees a valid user JWT). Body: { entity_type, entity_id }.

import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { checkUserRateLimit } from '../_shared/user-rate-limit.ts'

const VALID = new Set(['venue', 'event', 'marketplace'])

function subFrom(req: Request): string | null {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try { return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const entityType = String(body.entity_type ?? '')
    const entityId = String(body.entity_id ?? '')
    if (!VALID.has(entityType)) return errorResponse('invalid entity_type', 400, req)
    if (!/^[0-9a-f-]{36}$/i.test(entityId)) return errorResponse('invalid entity_id', 400, req)

    const allowed = await checkUserRateLimit(req, 'report-existence', 5, 3600)
    if (!allowed) return errorResponse('rate_limited', 429, req)

    const sub = subFrom(req)
    if (!sub) return errorResponse('unauthenticated', 401, req)

    // One vote per user per entity (best-effort dedup): skip if this user already voted.
    const { data: existing } = await supabase
      .from('entity_existence_signals')
      .select('id')
      .eq('entity_type', entityType).eq('entity_id', entityId)
      .eq('signal_kind', 'community_life').eq('source', 'report-existence')
      .contains('details', { actor: sub })
      .limit(1)
    if (existing && existing.length) return jsonResponse({ success: true, deduped: true }, 200, req)

    const { error } = await supabase.from('entity_existence_signals').insert({
      entity_type: entityType, entity_id: entityId, signal_kind: 'community_life',
      verdict: 'dead', weight: 0.2, source: 'report-existence',
      details: { actor: sub, reported_at: new Date().toISOString() },
    })
    if (error) return errorResponse(error.message, 500, req)
    return jsonResponse({ success: true }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
