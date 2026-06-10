import { getServiceClient } from './supabase-client.ts'

// Per-user sliding-window rate limit for cost-bearing (LLM) edge functions.
// These functions run with verify_jwt=true, so the gateway guarantees a valid
// user JWT — we decode (not re-verify) its `sub` to key the limit. Backed by
// the rate_limit_hit() RPC (atomic upsert). Fail-OPEN: any error or missing
// identity allows the request, so a limiter fault never breaks the feature.

function subFromAuthHeader(req: Request): string | null {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json)
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/**
 * Returns true if the request is allowed, false if the per-user limit for `fn`
 * is exceeded. Anonymous/unkeyable callers are allowed (gateway already gates
 * these functions). `max` requests per `windowSec` window.
 */
export async function checkUserRateLimit(
  req: Request,
  fn: string,
  max: number,
  windowSec: number,
): Promise<boolean> {
  const sub = subFromAuthHeader(req)
  if (!sub) return true
  try {
    const { data, error } = await getServiceClient().rpc('rate_limit_hit', {
      p_key: `${fn}|${sub}`,
      p_window: windowSec,
      p_max: max,
    })
    if (error) return true // fail open
    return data !== false
  } catch {
    return true // fail open
  }
}
