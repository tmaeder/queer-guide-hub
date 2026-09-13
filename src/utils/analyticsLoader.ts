/**
 * Consent-gated loader for /umami.js — finding F5.
 *
 * Previously the umami script tag was hard-coded into index.html with
 * `<script defer src="/umami.js">`, which meant page views were sent
 * to the analytics function on every request, regardless of whether
 * the user had granted analytics consent. The consent banner is a
 * lazy-loaded component; if that chunk failed to load, the user had
 * no way to refuse — yet tracking already ran.
 *
 * This loader:
 *  - reads consent directly from localStorage (no React, no chunk
 *    dependency), so it works even when the banner UI is broken;
 *  - injects the umami script only when `preferences.analytics ===
 *    true` in stored consent;
 *  - listens for the `cookieConsentUpdated` event the consent provider
 *    fires when the user makes a choice, so it can load tracking
 *    *after* explicit opt-in in the same session;
 *  - never loads tracking pre-consent ("fail closed").
 *
 * No Clarity / GA / GTM / ipapi loaders exist in this codebase. The
 * dynamic CSP in `functions/_lib/securityHeaders.ts` no longer
 * allow-lists those hosts, so the browser will block them if any
 * third-party widget ever attempts to inject one.
 */

// The consent read lives in `src/lib/analyticsConsent.ts` — one implementation
// of the rule, imported by this loader, by `src/sentry.ts`, and by every
// first-party event writer. It has no imports of its own, so this file keeps
// its "works even when the banner chunk failed to load" property.
import { hasAnalyticsConsent } from '@/lib/analyticsConsent';

const UMAMI_SCRIPT_ID = 'umami-analytics';
// Version query busts the year-long edge/browser cache the old /*.js rule
// applied to this unversioned file. Bump when the tracker script changes.
const UMAMI_SRC = '/umami.js?v=3';

/**
 * Withdrawal has to actually stop tracking, not merely stop it after a reload.
 * The loader previously handled `analytics === true` only, so a visitor who
 * turned analytics off kept being tracked for the rest of the session — the
 * one moment they had explicitly asked us not to.
 */
function removeUmami(): void {
  document.getElementById(UMAMI_SCRIPT_ID)?.remove();
  // The script's history patch and its `track` closure survive the tag being
  // removed, so dropping the global is what actually silences it: every
  // remaining emitter (travelAnalytics, tripTracking) goes through
  // `window.umami.track` and no-ops once it is gone.
  delete (window as { umami?: unknown }).umami;
}

function injectUmami(): void {
  if (document.getElementById(UMAMI_SCRIPT_ID)) return;
  const s = document.createElement('script');
  s.id = UMAMI_SCRIPT_ID;
  s.src = UMAMI_SRC;
  s.async = true;
  s.defer = true;
  s.setAttribute('data-website-id', 'queer-guide');
  // Prevent Cloudflare Rocket Loader from mangling the module.
  s.setAttribute('data-cfasync', 'false');
  document.head.appendChild(s);
}

export function installAnalyticsConsentLoader(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (hasAnalyticsConsent()) {
    // If the document hasn't finished its initial parse yet, defer the
    // injection until after first paint so we don't compete with the
    // app bundle for bandwidth.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectUmami, { once: true });
    } else {
      injectUmami();
    }
  }

  // Live-update path, both directions: start tracking the moment the user
  // opts in, and STOP the moment they opt out — without a reload either way.
  window.addEventListener('cookieConsentUpdated', (e: Event) => {
    const detail = (e as CustomEvent).detail as { analytics?: boolean } | undefined;
    if (detail?.analytics === true) injectUmami();
    else removeUmami();
  });
}
