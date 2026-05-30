/**
 * Strip the Referer header for cross-origin hotlinks. Some publisher CDNs
 * (Guardian, etc.) return 401 when Referer is set to a non-allowed origin.
 * Internal hosts get the default policy so analytics still works.
 */
const TRUSTED_HOSTS = new Set([
  'queer.guide',
  'www.queer.guide',
  'img.queer.guide',
]);

export function isTrustedSrc(src: string): boolean {
  try {
    const host = new URL(src, 'https://queer.guide').hostname;
    return (
      TRUSTED_HOSTS.has(host) ||
      host.endsWith('.supabase.co') ||
      host.endsWith('.supabase.in')
    );
  } catch {
    return true;
  }
}
