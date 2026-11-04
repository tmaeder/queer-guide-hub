/**
 * Removes every trailing `/` from a string in linear time.
 *
 * Replaces `s.replace(/\/+$/, '')`, which CodeQL flags as a polynomial
 * regular expression (js/polynomial-redos): on input with a long run of `/`
 * that is not at the end, the engine retries the run from every starting
 * position. The single-slash `/\/$/` form it replaced was flagged as
 * js/incomplete-sanitization because it removes only one slash. A plain loop
 * has neither problem.
 */
export function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end--;
  return end === s.length ? s : s.slice(0, end);
}
