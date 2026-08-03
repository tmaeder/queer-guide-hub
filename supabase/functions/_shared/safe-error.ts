// safe-error — turn a caught exception into something safe to put in an HTTP body.
//
// Echoing `e.message` (or `String(e)`) straight back to the caller is CWE-209:
// the text routinely carries Postgres error strings (column and constraint
// names, fragments of the failing statement) and, via Error.toString, the shape
// of our own call graph. CodeQL flags the pattern as js/stack-trace-exposure.
//
// The rule this encodes: a response may only carry a code WE chose. A handler
// declares the literals it throws itself; anything else — a DB driver message,
// a runtime TypeError, a third-party throw — collapses to a single opaque code
// and the real detail goes to the server log instead.
//
// This is deliberately an allowlist, not a redaction pass. Redaction has to
// guess which substrings are sensitive and is wrong the first time an upstream
// changes its wording; an allowlist is wrong only in the safe direction.

export const GENERIC_ERROR_CODE = 'internal_error'

/**
 * Reduce a caught value to a code that is safe to return to a caller.
 *
 * @param e        the caught value (may be anything — `catch` is untyped)
 * @param allowed  literals this handler throws itself and is happy to expose;
 *                 they must be fixed strings, never interpolated with data
 * @param context  label for the server-side log line
 * @returns a member of `allowed`, or {@link GENERIC_ERROR_CODE}
 */
export function safeErrCode(
  e: unknown,
  allowed: ReadonlySet<string> | readonly string[] = [],
  context = 'handler',
): string {
  const raw = e instanceof Error ? e.message : String(e)
  const set = allowed instanceof Set ? allowed : new Set(allowed)
  if (set.has(raw)) return raw
  // Full detail stays server-side, where the operator can still reach it.
  console.error(`${context}: unexpected failure`, e)
  return GENERIC_ERROR_CODE
}
