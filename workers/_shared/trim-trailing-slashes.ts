/**
 * Removes every trailing `/` from a string in linear time.
 *
 * Replaces `s.replace(/\/$/, '')`, which strips only one slash (CodeQL
 * js/incomplete-sanitization), and `s.replace(/\/+$/, '')`, which is a
 * polynomial regular expression (js/polynomial-redos). Mirrors
 * src/lib/trimTrailingSlashes.ts for code that cannot import it.
 */
export function trimTrailingSlashes(s: string): string {
	let end = s.length;
	while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end--;
	return end === s.length ? s : s.slice(0, end);
}
