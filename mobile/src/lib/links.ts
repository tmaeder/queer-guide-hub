/**
 * Outbound links. Every URL that reaches `Linking.openURL` goes through one of
 * these, so a row holding `javascript:` or a malformed value can never be
 * handed to the OS.
 */

/** The URL if it is http(s), upgraded to https; otherwise null. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.')) return null;
  url.protocol = 'https:';
  return url.toString();
}

/** `tel:` URL for a stored phone (E.164 on venues), or null. */
export function telUrl(raw: string | null | undefined): string | null {
  const digits = raw?.replace(/[^\d+]/g, '') ?? '';
  return digits.replace(/\D/g, '').length >= 3 ? `tel:${digits}` : null;
}

/** Hand-off to the platform's own maps app — no third-party SDK in between. */
export function directionsUrl(os: string, lat: number, lng: number, label: string): string {
  const q = encodeURIComponent(label);
  if (os === 'ios') return `https://maps.apple.com/?daddr=${lat},${lng}&q=${q}`;
  return `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
}
