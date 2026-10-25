/**
 * Constant-time string equality for secrets. A plain `===` returns at the
 * first differing character, so response timing leaks how much of a guessed
 * secret was right. Mirrors supabase/functions/_shared/timing-safe.ts.
 */
export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
