// Extract a readable message from any thrown value.
//
// Supabase / PostgREST errors are plain objects ({ message, code, details,
// hint }) — NOT Error instances — so `String(e)` on them yields the useless
// "[object Object]". Read `.message` first, then fall back sensibly.
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
    try {
      return JSON.stringify(e)
    } catch {
      /* not serializable — fall through */
    }
  }
  return String(e)
}
