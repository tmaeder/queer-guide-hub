/**
 * Proof that an analytics beacon came through our own `/api/track` Cloudflare
 * Pages proxy rather than being POSTed straight at the edge function.
 *
 * `umami-analytics` is `verify_jwt = false` and cannot be otherwise: an
 * anonymous first-party tracker carries no user JWT, so flipping that flag
 * would 401 every real beacon while the dashboards read the result as "traffic
 * fell" — the exact failure class this hardening exists to remove. A shared
 * secret held by the proxy achieves the real goal (only our edge may write).
 *
 * **Inert when unset, strict when set, and never the other way round.** The
 * secret is configured on two systems, so there is necessarily a window where
 * one side has it and the other does not; rejecting during that window would
 * drop all traffic. Set it on Cloudflare Pages FIRST, then on Supabase.
 *
 * Nothing can report whether this is armed. The value lives in two env vars on
 * two platforms, and neither Postgres nor the health check can read either —
 * so treat the secret as OFF until you have verified both sides by hand. What
 * IS observable is the effect: `analytics_hygiene_stats()`'s
 * sessions_null_country_pct_24h goes high the moment anything writes without
 * going through the proxy, which is the same thing this secret prevents.
 *
 * It lives in `_shared/` rather than inside the function because
 * `umami-analytics/index.ts` builds a service client at module scope — so
 * importing it from a test requires real credentials, and a rule this
 * direction-sensitive has to be testable without them.
 */
export function proxySecretOk(req: Request): boolean {
  const expected = Deno.env.get('TRACK_PROXY_SECRET');
  if (!expected) return true;
  return req.headers.get('x-qg-track-key') === expected;
}
