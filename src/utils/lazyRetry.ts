import React, { lazy } from 'react';

/**
 * Retry wrapper for React.lazy — handles chunk load failures after deploys.
 *
 * Strategy:
 * 1. First attempt: the dynamic import as written.
 * 2. On rejection (most often a stale hashed chunk after a new deploy):
 *    wait briefly, then retry the import once. The retry hits the network
 *    fresh and can succeed if the service worker was holding a poisoned
 *    entry that's since been evicted.
 * 3. If the retry still fails, hard-reload once (gated by sessionStorage)
 *    so the browser re-requests index.html and picks up the current
 *    chunk hashes. The reload guard prevents an infinite loop.
 */
export function lazyRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() => retryDynamicImport(factory));
}

/**
 * Variant for non-critical UI (cookie banner, install banner, FAB). If
 * the chunk genuinely cannot load even after a retry + reload, we render
 * NOTHING rather than crash the whole app or show an error. The banner
 * being temporarily absent is strictly better than a blank screen.
 */
export function lazyOptional<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    retryDynamicImport(factory).catch(() => {
      // Final fallback: render-nothing component. React.lazy requires
      // a module shape with a `default` export.
      return { default: (() => null) as unknown as T };
    }),
  );
}

function retryDynamicImport<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch((firstErr) => {
    // Brief delay before retry so the network/SW has a moment to settle.
    return new Promise<void>((resolve) => setTimeout(resolve, 250))
      .then(factory)
      .catch(() => {
        // Retry also failed — try a one-time hard reload, gated to
        // prevent infinite loops if the underlying file is truly broken.
        const key = 'chunk-reload-' + window.location.pathname;
        try {
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            window.location.reload();
            // Never-resolving promise: keep React in Suspense state
            // while the page reloads.
            return new Promise<T>(() => {});
          }
          // Already tried reloading on this path — surface the real error.
          sessionStorage.removeItem(key);
        } catch {
          // sessionStorage may be unavailable (private mode, sandbox).
        }
        throw firstErr;
      });
  });
}
