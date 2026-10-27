import { hasAnalyticsConsent } from './analyticsConsent';

type SentrySDK = typeof import('@sentry/react');
let pendingSDK: Promise<SentrySDK> | undefined;

/** Optional diagnostics must not put the SDK on the initial request path.
 * Recheck consent after the chunk arrives in case it was withdrawn in flight.
 * A blocked/failed SDK must never break the operation being reported. */
export function withSentry(report: (sdk: SentrySDK) => void): void {
  if (!hasAnalyticsConsent()) return;
  pendingSDK ??= import('@sentry/react').catch((error: unknown) => {
    pendingSDK = undefined;
    throw error;
  });
  void pendingSDK
    .then((sdk) => {
      if (hasAnalyticsConsent()) report(sdk);
    })
    .catch(() => {
      // Diagnostics are best-effort; the application's own recovery continues.
    });
}

export function captureException(...args: Parameters<SentrySDK['captureException']>): void {
  withSentry((sdk) => {
    sdk.captureException(...args);
  });
}

export function addBreadcrumb(...args: Parameters<SentrySDK['addBreadcrumb']>): void {
  withSentry((sdk) => {
    sdk.addBreadcrumb(...args);
  });
}
