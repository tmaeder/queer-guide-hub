import { getServiceClient } from './supabase-client.ts'

// Per-IP sliding-window rate limit for cost-bearing functions that are
// genuinely public (no login required — city/country pages, weather widgets)
// and so cannot use the per-user limiter in user-rate-limit.ts, which is a
// no-op for anonymous callers by design. Backed by the same rate_limit_hit()
// RPC (atomic upsert), keyed by client IP instead of JWT subject.
// Fail-OPEN: any error allows the request, so a limiter fault never breaks
// the feature — this exists to blunt scripted cost/quota abuse, not to gate
// legitimate traffic.

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const rip = req.headers.get('x-real-ip')
  if (rip) return rip.trim()
  return 'unknown'
}

/**
 * Returns true if the request is allowed, false if the per-IP limit for `fn`
 * is exceeded. `max` requests per `windowSec` window.
 */
export async function checkIpRateLimit(
  req: Request,
  fn: string,
  max: number,
  windowSec: number,
): Promise<boolean> {
  const ip = clientIp(req)
  if (ip === 'unknown') return true
  try {
    const { data, error } = await getServiceClient().rpc('rate_limit_hit', {
      p_key: `${fn}|ip:${ip}`,
      p_window: windowSec,
      p_max: max,
    })
    if (error) return true // fail open
    return data !== false
  } catch {
    return true // fail open
  }
}
