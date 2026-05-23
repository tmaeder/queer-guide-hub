import { DEFAULT_OG_IMAGE } from './routeMeta';

/**
 * Hosts we refuse to hotlink an og:image from. Wikipedia and Wikimedia don't
 * serve images with terms compatible with og:image use (no CORS, weak SLAs,
 * frequent renames). Falling back to the branded default beats serving a
 * broken/irrelevant image card.
 */
const BLOCKED_HOSTS = new Set([
  'wikipedia.org',
  'en.wikipedia.org',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
]);

/**
 * Returns a safe og:image URL — the input if it passes the rules, the branded
 * default otherwise. Rules:
 *   - input must be a string
 *   - must be a valid absolute URL
 *   - must be https:// (Facebook/Twitter cards reject http: at scale)
 *   - host must not be on BLOCKED_HOSTS or end with `.wikimedia.org`
 */
export function safeOgImage(url: unknown): string {
  if (typeof url !== 'string' || !url) return DEFAULT_OG_IMAGE;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return DEFAULT_OG_IMAGE;
  }
  if (parsed.protocol !== 'https:') return DEFAULT_OG_IMAGE;
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return DEFAULT_OG_IMAGE;
  if (host.endsWith('.wikimedia.org')) return DEFAULT_OG_IMAGE;
  if (host.endsWith('.wikipedia.org')) return DEFAULT_OG_IMAGE;
  return url;
}
