// Dependency-free on purpose: src/lib/redirects/__tests__/*Worker.test.ts inline
// supabase-client.ts as text with its imports stripped, and inline this file too.

/**
 * Constant-time string equality for secrets. A plain `===` returns at the
 * first differing character, so response timing leaks how much of a guessed
 * secret was right. Length is not secret-bearing here (all callers compare
 * against a fixed-length configured value).
 */
export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
