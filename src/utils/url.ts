/**
 * URL normalization and validation for user-provided links.
 *
 * Purpose-built for submission forms: we want to accept bare domains like
 * `example.com` (auto-prefix https://), reject obvious garbage (`foo`,
 * `https://foo`, `javascript:…`), and give the server a value it can trust.
 */

/** Prepend `https://` when the value lacks an http(s) scheme. Non-strings pass through. */
export function ensureProtocol(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * True when `value` parses as an http(s) URL with a real-looking host.
 * Rejects: other schemes, whitespace, hosts without a dot, bare IPs.
 */
const PRIVATE_IPV4 = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
];

export function isValidHttpUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  // Reject localhost and any *.localhost
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  // Reject IPv6 literals entirely (public URLs should use hostnames)
  if (host.includes(':') || host.startsWith('[')) return false;
  // Reject all IPv4 literals — keep public submissions to real domains.
  // (Private ranges are additionally flagged explicitly for clarity.)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  // Guard against bare private-range patterns in case the format shifts.
  if (PRIVATE_IPV4.some((re) => re.test(host))) return false;
  // Require at least one dot, no leading/trailing/consecutive dots.
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return false;
  const tld = host.split('.').pop() || '';
  if (tld.length < 2 || !/^[a-z]{2,}$/i.test(tld)) return false;
  return true;
}

export type UrlValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Normalize a user-typed URL (adding https:// if missing) and validate it.
 * Returns the normalized URL on success; a human-friendly reason on failure.
 */
export function normalizeAndValidateUrl(value: unknown): UrlValidation {
  if (typeof value !== 'string') return { ok: false, reason: 'Please enter a full valid URL like https://example.com' };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: 'Please enter a full valid URL like https://example.com' };
  const normalized = ensureProtocol(trimmed) as string;
  if (!isValidHttpUrl(normalized)) {
    return {
      ok: false,
      reason: 'Please enter a full valid URL like https://example.com',
    };
  }
  return { ok: true, value: normalized };
}
