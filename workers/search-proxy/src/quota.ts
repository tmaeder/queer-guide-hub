/** Current IETF rate-limit draft Structured Fields, plus numeric compatibility
 * fields. Values describe the existing KV fixed-minute counter, which is
 * approximate under contention; they do not promise additional capacity. */
export function quotaHeaders(limit: number, remaining: number, reset: number): Record<string, string> {
  return {
    'RateLimit-Policy': `"search";q=${limit};w=60`,
    RateLimit: `"search";r=${remaining};t=${reset}`,
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(remaining),
    'RateLimit-Reset': String(reset),
    'Access-Control-Expose-Headers': 'RateLimit, RateLimit-Policy, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After',
  };
}
