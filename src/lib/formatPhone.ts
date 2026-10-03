/**
 * Display form of a phone number: E.164, "+<calling code><number>", with no
 * spaces or separators — one format everywhere on the site.
 *
 * Stored numbers on venues, organizations and hotels are already E.164: the
 * `phone_canonical_guard` trigger rewrites every write (migration
 * 99991790877996). This function therefore leaves an E.164 value untouched and
 * only compacts a legacy "+49 30 213 4570"-style value that predates it.
 * Anything else (no leading "+", prose, two numbers) passes through unchanged —
 * guessing a country code here would invent one.
 */
export function formatPhoneDisplay(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/[\s\-()./]/g, '');
  if (/^\+[1-9]\d{6,14}$/.test(compact)) return compact;
  return trimmed;
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
