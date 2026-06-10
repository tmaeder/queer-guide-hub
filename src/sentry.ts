import * as Sentry from '@sentry/react';

if (import.meta.env.VITE_SENTRY_DSN) {
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
