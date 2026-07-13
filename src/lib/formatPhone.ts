/**
 * Light display formatting for phone numbers. Scraped venue phones arrive as
 * unbroken E.164-ish strings ("+49302134570"); a full libphonenumber pass
 * isn't worth the bundle, but a country-code split plus 3-digit grouping
 * makes them scannable. Anything that doesn't look like a plain number
 * passes through untouched (extensions, "or", multiple numbers).
 */
export function formatPhoneDisplay(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Already human-formatted (spaces, dashes, parens) — leave it alone.
  if (/[\s\-()./]/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^\+(\d{7,15})$/);
  if (!m) return trimmed;
  const digits = m[1];
  // Country codes are 1-3 digits; prefer the common 2-digit split, 1 for NANP.
  const ccLen = digits.startsWith('1') || digits.startsWith('7') ? 1 : 2;
  const cc = digits.slice(0, ccLen);
  const rest = digits.slice(ccLen);
  const groups = rest.match(/.{1,3}/g) ?? [rest];
  return `+${cc} ${groups.join(' ')}`;
}
