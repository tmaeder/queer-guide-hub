/**
 * The one place that answers "may we track this visitor?".
 *
 * This module deliberately has **zero imports**. Every consumer of it is a
 * fail-closed privacy gate that has to work when the rest of the app does not:
 * `src/utils/analyticsLoader.ts` runs before React mounts, `src/sentry.ts` runs
 * before the error boundary exists, and the cookie banner itself is a lazily
 * loaded chunk that can fail to load. Pulling any dependency in here would put
 * a chunk between the user's choice and our honouring of it.
 *
 * Why it exists: the same "read consent from localStorage" logic was written
 * three separate times — `analyticsLoader.ts`, `sentry.ts` and
 * `useCookieConsent.tsx` — and a fourth pipeline
 * (`components/analytics/AnalyticsTracker.tsx`) simply never asked at all.
 * Measured on prod 2026-09-12, that ungated pipeline was carrying **98.9% of
 * all tracking** (398,018 of 402,364 sessions had no `country`, which is only
 * ever set on the consent-gated path) while the published Cookie policy said
 * analytics loads "only with your consent". Three copies of a privacy rule is
 * how one of them goes stale; four is how one goes missing.
 *
 * Storage shape (written by `useCookieConsent.tsx`):
 *   { preferences: { necessary, functional, analytics, marketing },
 *     version: '1.0', timestamp: ISO }
 */

/**
 * Window event any surface can dispatch to reopen the cookie preferences
 * dialog. It lives here rather than in `CookieConsentBanner.tsx` because the
 * banner is a `lazyOptional` chunk — importing a constant from it would pull
 * the whole banner into the footer's bundle — and because a component module
 * may not export non-components (react-refresh).
 */
export const OPEN_COOKIE_PREFERENCES_EVENT = 'openCookiePreferences';

export const CONSENT_STORAGE_KEY = 'queer-guide-cookie-consent';
export const CONSENT_VERSION = '1.0';

interface StoredConsent {
  preferences?: {
    necessary?: boolean;
    functional?: boolean;
    analytics?: boolean;
    marketing?: boolean;
  };
  version?: string;
}

/**
 * True only when the visitor has explicitly opted into the `analytics`
 * category at the current consent version.
 *
 * Fails closed on every uncertainty: no storage, absent key, unparseable JSON,
 * a stale consent version (the version bump is how we re-ask after the policy
 * changes), or an `analytics` flag that is anything other than boolean `true`.
 */
export function hasAnalyticsConsent(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as StoredConsent;
    if (data.version !== CONSENT_VERSION) return false;
    return data.preferences?.analytics === true;
  } catch {
    return false;
  }
}

/**
 * Browser-signalled Do Not Track, in every spelling that shipped.
 *
 * Honouring DNT is not the same question as consent: a visitor can accept the
 * banner in one tab and still have DNT on, and DNT wins. `public/umami.js`
 * checked only `navigator.doNotTrack`/`navigator.msDoNotTrack`; the retired
 * inline tracker also read `window.doNotTrack` and Microsoft's
 * `msTrackingProtectionEnabled`, so the union is what lives here.
 */
export function isDoNotTrackEnabled(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { msDoNotTrack?: string };
    const win =
      typeof window === 'undefined' ? undefined : (window as Window & { doNotTrack?: string });
    const dnt = win?.doNotTrack ?? nav.doNotTrack ?? nav.msDoNotTrack;
    return dnt === '1' || dnt === 'yes';
  } catch {
    return false;
  }
}

/**
 * A browser under automation — Playwright, Puppeteer, Lighthouse, headless
 * Chrome. `navigator.webdriver` is a standards-defined flag the automation
 * driver sets itself, so this is a declaration, not UA sniffing: it cannot
 * misclassify a real visitor who merely has an unusual user agent, and it
 * costs nothing to keep correct.
 *
 * It is a separate predicate from DNT because the two are different claims.
 * Excluding automation is a data-quality decision; honouring DNT is a privacy
 * obligation, and conflating them would let a data-quality tweak silently
 * weaken the privacy gate.
 */
export function isAutomatedClient(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true;
  } catch {
    return false;
  }
}

/**
 * The single question a first-party tracking writer should ask before writing.
 *
 * Consent AND not-DNT AND not-automated. Anything that emits a row keyed to a
 * visitor goes through this; nothing should re-derive it from the parts.
 */
export function analyticsAllowed(): boolean {
  return hasAnalyticsConsent() && !isDoNotTrackEnabled() && !isAutomatedClient();
}

/**
 * Subscribe to consent changes. Returns an unsubscribe function.
 *
 * `useCookieConsent.tsx` dispatches `cookieConsentUpdated` with the new
 * preferences as `detail`. The callback receives the resulting *effective*
 * permission (i.e. consent combined with DNT and automation), because that is
 * the value a caller acts on — a listener that only saw `detail.analytics`
 * would re-enable tracking for a DNT visitor who pressed "Accept all".
 *
 * When the event carries no usable detail — which is what a future
 * consent-withdrawal dispatch looks like — the state is re-read from storage
 * rather than assumed, so the fail-closed path is the default.
 */
export function onAnalyticsConsentChange(callback: (allowed: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { analytics?: boolean } | undefined;
    const granted =
      typeof detail?.analytics === 'boolean' ? detail.analytics : hasAnalyticsConsent();
    callback(granted && !isDoNotTrackEnabled() && !isAutomatedClient());
  };

  window.addEventListener('cookieConsentUpdated', handler);
  return () => window.removeEventListener('cookieConsentUpdated', handler);
}
