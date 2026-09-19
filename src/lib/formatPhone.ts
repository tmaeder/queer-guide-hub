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

/**
 * The dialable half of the same number, for a `tel:` href.
 *
 * RFC 3966 allows only digits, a leading `+` and visual separators `-.()`; spaces
 * are NOT valid in a tel URI, and this corpus is full of human-formatted numbers
 * with them ("+49 30 2134570", "(212) 555-1234"). Most dialers cope, but a user
 * asked specifically whether tapping a number dials it on a phone, so don't leave
 * it to the dialer's tolerance.
 *
 * Returns null when nothing dialable is left — a venue whose "phone" is prose
 * ("call the bar") should render as text, not as a dead link. Keeps a leading `+`
 * only, because an interior one means two numbers were concatenated and we can't
 * tell which one to dial.
 */
export function formatPhoneHref(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  // Shorter than 5 digits isn't a phone number — most likely a stray fragment.
  if (digits.length < 5) return null;
  return `tel:${plus}${digits}`;
}
