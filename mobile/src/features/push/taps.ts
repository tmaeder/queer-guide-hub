import { safeHttpsUrl } from '@/lib/links';

/**
 * Where a tapped notification goes. The dispatcher sends a site path
 * (`/messages?conversation=…`, `/trips/…`). Paths the app has a screen for
 * open in the app; everything else opens queer.guide in the browser.
 */
export type TapTarget = { kind: 'app'; path: string } | { kind: 'web'; url: string } | null;

const APP_PATH = /^\/(?:(?:venues|events|city)\/[A-Za-z0-9-]+|help)$/;

export function notificationTarget(raw: unknown): TapTarget {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null;
  if (APP_PATH.test(raw)) return { kind: 'app', path: raw };
  const url = safeHttpsUrl('https://queer.guide' + raw);
  return url ? { kind: 'web', url } : null;
}
