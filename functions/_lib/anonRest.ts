/**
 * PostgREST reads that MUST run with the anonymous key.
 *
 * Deliberately separate from the fetchers in `detail.ts` and `sitemap.ts`,
 * which both do `SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY`. The service
 * role bypasses row-level security, so any payload built with it and then
 * injected into HTML served to everyone would expose safety-gated entities —
 * venues, events and organizations in criminalizing and death-penalty
 * countries, which must only be visible to signed-in users.
 *
 * There is no service-key fallback here and there must never be one. If the
 * anon key is missing, the caller gets nothing and the client fetches for
 * itself; a slower first paint is the correct failure mode.
 *
 * Do not import `fetchRows` from `./sitemap` or the helpers in `./detail` for
 * anything whose output reaches an anonymous reader.
 */

interface AnonEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface AnonSelectOptions {
  /** Abandon the request after this many ms. */
  timeoutMs?: number;
}

/**
 * Runs a PostgREST select as the anonymous role.
 *
 * Returns `null` (not `[]`) when the read could not be performed at all, so a
 * caller can tell "no rows" from "no answer" and skip injecting a payload that
 * would wrongly look empty.
 */
export async function anonSelect<T = Record<string, unknown>>(
  env: AnonEnv,
  relation: string,
  queryString: string,
  options: AnonSelectOptions = {},
): Promise<T[] | null> {
  const key = env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !key) return null;

  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const url = `${base}/rest/v1/${relation}?${queryString}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);

  try {
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows as T[]) : null;
  } catch {
    // Timeout, abort or transport error. Never let a pre-hydration read fail
    // the page it was only meant to make faster.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
