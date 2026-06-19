/**
 * Internal-secret gate. The extract worker is infra — only trusted callers
 * (Supabase edge functions, the submit worker, the scraper) reach it, each
 * presenting the shared secret as X-Internal-Secret. Matches the Supabase side's
 * INTERNAL_INVOKE_SECRET (see _shared/supabase-client.ts hasInternalSecret).
 */
export function hasInternalSecret(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const provided = req.headers.get('x-internal-secret');
  return provided === expected;
}
