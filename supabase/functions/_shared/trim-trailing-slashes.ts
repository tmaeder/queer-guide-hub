/**
 * Removes every trailing `/` from a string in linear time.
 *
 * `s.replace(/\/+$/, '')` is a polynomial regular expression
 * (CodeQL js/polynomial-redos): on a long run of `/` that is not at the end,
 * the engine retries the run from every starting position. Mirrors
 * src/lib/trimTrailingSlashes.ts, which this package cannot import.
 */
export function trimTrailingSlashes(s: string): string {
  let end = s.length
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end--
  return end === s.length ? s : s.slice(0, end)
}
