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

const CONSENT_STORAGE_KEY = 'queer-guide-cookie-consent';
const CONSENT_VERSION = '1.0';
const UMAMI_SCRIPT_ID = 'umami-analytics';
const UMAMI_SRC = '/umami.js';

interface StoredConsent {
  preferences: {
    necessary?: boolean;
    functional?: boolean;
    analytics?: boolean;
    marketing?: boolean;
  };
  version?: string;
}

function hasAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as StoredConsent;
    if (data.version !== CONSENT_VERSION) return false;
    return data.preferences?.analytics === true;
  } catch {
    return false;
  }
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

  // Live-update path: when the user accepts analytics in the banner,
  // start tracking immediately without a reload.
  window.addEventListener('cookieConsentUpdated', (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { analytics?: boolean }
      | undefined;
    if (detail?.analytics === true) injectUmami();
  });
}
