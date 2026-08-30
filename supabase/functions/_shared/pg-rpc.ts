/**
 * Minimal PostgREST RPC caller — no supabase-js.
 *
 * Same reasoning as llm-usage-log.ts, and for the same blast radius: the
 * modules that need this (llm-router.ts, llm-rate-limit.ts) are imported by
 * llm-client.ts, which is imported by nearly every edge function. Pulling the
 * client SDK down that path would add it to every cold start in the fleet for
 * the sake of three RPC calls.
 *
 * It also removes a signature problem that would otherwise have leaked into
 * twenty call sites: `llmChatCompletion()` takes no Supabase client, so a
 * router that required one could not be called from it without changing every
 * caller.
 *
 * NEVER THROWS. Returns `{ ok: false }` on any failure — missing credentials,
 * network error, non-2xx, unparseable body. Callers decide what an unavailable
 * RPC means for them; for the router it means "NVIDIA cannot be verified as
 * safe to use", which routes to the fallback.
 */

export interface RpcResult<T> {
  ok: boolean
  data: T | null
  error?: string
}

const FAILED = <T>(error: string): RpcResult<T> => ({ ok: false, data: null, error })

/** Call a Postgres function through PostgREST with the service role. */
export async function callRpc<T>(
  fn: string,
  args: Record<string, unknown>,
  timeoutMs = 5_000,
): Promise<RpcResult<T>> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  // No service credentials (local dev, unit tests). Not an error worth logging
  // on every call — the caller's fallback path is the correct behaviour here.
  if (!url || !key) return FAILED('no_service_credentials')

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: ac.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return FAILED(`${res.status}: ${body.slice(0, 200)}`)
    }
    // A Postgres function returning void gives an empty body, which is a
    // success, not a parse failure.
    const text = await res.text()
    if (!text.trim()) return { ok: true, data: null }
    return { ok: true, data: JSON.parse(text) as T }
  } catch (e) {
    return FAILED((e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message)
  } finally {
    clearTimeout(timer)
  }
}
