/**
 * Centralised security headers + CSP for HTML responses.
 *
 * Static, non-HTML responses (hashed assets, /build-id.txt, JSON
 * sitemaps, …) inherit the policy from `public/_headers`. The
 * middleware uses this module for:
 *   - the rewritten SPA shell (HTML)
 *   - the synthetic 404 for unknown detail slugs
 *   - the synthetic 404 for missing static-asset paths (F2)
 *
 * The CSP is generated per-request with a fresh nonce that is also
 * applied to every <script> tag in the HTML by the middleware's
 * HTMLRewriter. This removes the long-standing `'unsafe-inline'` on
 * `script-src` from the CSP — the only inline scripts now run with the
 * nonce, every other script is hashed-URL same-origin.
 *
 * Notes:
 *  - `style-src` keeps `'unsafe-inline'` for now. Removing it is more
 *    invasive (Tailwind v4 + a few inline `style=…` attributes in
 *    third-party widgets) and is tracked separately.
 *  - The connect/script/frame allow-lists have been trimmed: every
 *    host that no front-end code actually loads (Microsoft Clarity,
 *    Google Analytics / Tag Manager, ipapi.co) has been removed so the
 *    browser blocks them if a third-party widget ever tries to inject
 *    one.
 */

const CONNECT_SRC = [
  "'self'",
  'https://*.supabase.co',
  'https://*.maeder-tobiassimon.workers.dev',
  'https://*.queer.guide',
  'https://protomaps.github.io',
  'https://challenges.cloudflare.com',
  'https://js.stripe.com',
  'https://maps.googleapis.com',
  'https://maps.gstatic.com',
  'https://commons.wikimedia.org',
  'https://en.wikipedia.org',
  'https://widget.getyourguide.com',
  'https://*.getyourguide.com',
  'https://api.travelpayouts.com',
  'https://pics.avs.io',
  'https://*.hotellook.com',
  'https://*.ingest.sentry.io',
  'https://*.ingest.de.sentry.io',
  'https://*.ingest.us.sentry.io',
  'https://api.open-meteo.com',
  'https://archive-api.open-meteo.com',
  'wss://*.supabase.co',
];

const SCRIPT_SRC_HOSTS = [
  "'self'",
  'https://challenges.cloudflare.com',
  'https://js.stripe.com',
  'https://maps.googleapis.com',
  'https://maps.gstatic.com',
  'https://widget.getyourguide.com',
];

// Intentionally empty. Two inline-script SHA-256 hashes were previously
// allow-listed here under the assumption they were Cloudflare Pages' own
// beacon. They are in fact the inline stubs that bootstrap Google Tag Manager
// + Microsoft Clarity — allow-listing them re-enables the analytics chain this
// project intentionally turned off. They stay blocked. (CF's Web Analytics
// beacon is an external script under script-src hosts, not an inline hash.)
//
// Root cause traced 2026-06-10: the stubs (GTM-5KHP3NFH, "first-party mode"
// Google tag) are injected at the Cloudflare ZONE layer by the
// "Google tag gateway" setting (API: zones/{id}/settings/google_tag_gateway),
// AFTER this middleware runs — browser UAs only, so curl never sees them.
// They reach the page at document lines 2-3 and the nonce CSP blocks them,
// which is the two console errors on every page. Code-side this is working
// as designed; the permanent fix is turning OFF "Google tag gateway" in the
// CF dashboard for the queer.guide zone. Do NOT add the hashes here.
const CF_PAGES_INLINE_SCRIPT_HASHES: string[] = [];

const FRAME_SRC = [
  "'self'",
  'https://challenges.cloudflare.com',
  'https://js.stripe.com',
  'https://widget.getyourguide.com',
  'https://*.getyourguide.com',
];

const IMG_SRC = ["'self'", 'data:', 'blob:', 'https:'];
// *.supabase.co allows custom brand fonts served from our storage bucket
// (Design & Branding control center). Keep in sync with public/_headers font-src.
const FONT_SRC = ["'self'", 'data:', 'https://protomaps.github.io', 'https://*.supabase.co'];

export function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src ${SCRIPT_SRC_HOSTS.join(' ')} 'nonce-${nonce}' ${CF_PAGES_INLINE_SCRIPT_HASHES.join(' ')}`,
    // style-src keeps 'unsafe-inline' for Tailwind / a few inline
    // style= attributes — tightening this is tracked separately.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${IMG_SRC.join(' ')}`,
    `font-src ${FONT_SRC.join(' ')}`,
    `connect-src ${CONNECT_SRC.join(' ')}`,
    `frame-src ${FRAME_SRC.join(' ')}`,
    "frame-ancestors 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

// Static headers (non-CSP) applied to every middleware-constructed
// Response. The CSP is dynamic and added separately so callers can
// reuse the same nonce as the HTML rewriter.
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(self), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

/** Generate a 128-bit base64url nonce for per-response CSP. */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  // btoa is available in Workers/Pages runtime.
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Apply STATIC_SECURITY_HEADERS + dynamic CSP onto a Response in-place. */
export function applySecurityHeaders(res: Response, nonce: string): void {
  for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  res.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));
}
