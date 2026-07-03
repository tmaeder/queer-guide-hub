// Shared plain webhook-secret check for cron-driven functions.
//
// Pattern: pg_cron (or an admin tool) calls the function with an
// `X-Webhook-Secret` header whose value comes from Vault; the function
// compares it against an env secret. FAIL-CLOSED: when the env secret is
// unset, this returns false — callers then fall back to their admin/internal
// gate (or 401). Never default the expected secret to a literal.
//
// For signed request bodies (runner ↔ callback) use `hmac.ts` instead.

/**
 * True only when `envVar` is configured AND the request carries the matching
 * `X-Webhook-Secret` header. Accepts additional env var names as fallbacks
 * (checked in order), e.g. a function-specific secret then a generic one.
 */
export function hasValidWebhookSecret(req: Request, ...envVars: string[]): boolean {
  const provided = req.headers.get('x-webhook-secret');
  if (!provided) return false;
  for (const name of envVars) {
    const expected = Deno.env.get(name);
    if (expected && provided === expected) return true;
  }
  return false;
}
