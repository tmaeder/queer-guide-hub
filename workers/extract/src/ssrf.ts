/**
 * SSRF guard — block fetches to private / loopback / link-local hosts.
 * Host-pattern set adapted from deepcrawl `utils/url/validate-url.ts` (@ cb4817b).
 * The extract worker fetches arbitrary caller-supplied URLs, so every URL must
 * pass through here before fetch().
 */

const UNSAFE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./, // link-local (incl. cloud metadata 169.254.169.254)
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  /\.(local|internal|localhost)$/i,
];

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** Returns a normalized URL or throws UnsafeUrlError. */
export function assertPublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`invalid url: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new UnsafeUrlError(`blocked protocol: ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  for (const re of UNSAFE_HOST_PATTERNS) {
    if (re.test(host)) throw new UnsafeUrlError(`blocked host: ${u.hostname}`);
  }
  return u;
}
