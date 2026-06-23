import * as Sentry from '@sentry/react';

/**
 * Consent-gated Sentry init.
 *
 * Sentry is a third-party (US) error-diagnostics processor. The Cookie and
 * Privacy policies state that optional analytics & diagnostics load only with
 * the user's consent, so — like the Umami loader in `analyticsLoader.ts` — we
 * never call `Sentry.init` until the user has granted analytics consent. Consent
 * is read straight from localStorage (no React, no lazy chunk) so it works even
 * if the banner UI failed to load, and we "fail closed": no consent → no Sentry.
 *
 * We gate on the same `analytics` preference flag as Umami (the cookie dialog
 * groups usage analytics and error diagnostics together).
 */

const CONSENT_STORAGE_KEY = 'queer-guide-cookie-consent';
const CONSENT_VERSION = '1.0';

let initialized = false;

function hasAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as {
      preferences?: { analytics?: boolean };
      version?: string;
    };
    if (data.version !== CONSENT_VERSION) return false;
    return data.preferences?.analytics === true;
  } catch {
    return false;
  }
}

function initSentry(): void {
  if (initialized) return;
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  initialized = true;
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session replay disabled: captures user content which may include PII.
      // Re-enable with maskAllText:true + blockAllMedia:true after a privacy review.
      Sentry.feedbackIntegration({ autoInject: false }),
    ],
    tracesSampleRate: 0.1,
    // Session replay off.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      // Strip user context that may contain PII before sending to Sentry.
      if (event.user) {
        // Keep only a stable anonymous id; drop email, username, ip_address.
        const { id } = event.user;
        event.user = id ? { id } : undefined;
      }
      return event;
    },
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      /Loading chunk .* failed/,
      /Failed to fetch dynamically imported module/,
      'Lock was stolen by another request',
      'AbortError: Lock was stolen by another request',
    ],
  });
}

/**
 * Initialize Sentry now if consent is already granted, and arm a listener so it
 * initializes the moment the user opts in during this session (no reload).
 */
export function installSentry(): void {
  if (typeof window === 'undefined') return;

  if (hasAnalyticsConsent()) initSentry();

  window.addEventListener('cookieConsentUpdated', (e: Event) => {
    const detail = (e as CustomEvent).detail as { analytics?: boolean } | undefined;
    if (detail?.analytics === true) initSentry();
  });
}
