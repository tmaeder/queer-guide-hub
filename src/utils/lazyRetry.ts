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
/**
 * Guard against a dynamic import that *resolves* but yields a module with no
 * usable `default` export. This happens during the deploy window when a stale
 * `index.html` requests a chunk hash that the new deploy serves as a different
 * (or partially-initialised) module. Without this guard React.lazy reads
 * `.default` off `undefined` and throws the cryptic "Cannot read properties of
 * undefined (reading 'default')", crashing the route. Throwing here instead
 * routes the failure into retryDynamicImport's retry → reload recovery.
 */
function ensureDefaultExport<T>(mod: { default: T } | undefined | null): { default: T } {
  if (mod == null || typeof mod.default === 'undefined') {
    throw new Error('lazyRetry: dynamic import resolved without a default export (stale/partial chunk)');
  }
  return mod;
}

export function lazyRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() => retryDynamicImport(() => factory().then(ensureDefaultExport)));
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
    retryDynamicImport(() => factory().then(ensureDefaultExport)).catch(() => {
      // Final fallback: render-nothing component. React.lazy requires
      // a module shape with a `default` export.
      return { default: (() => null) as unknown as T };
    }),
  );
}

// A recovery reload is allowed at most once per path within this window.
// Within the cooldown the chunk is genuinely broken (we JUST reloaded and it
// still fails), so surface the error instead of loop-reloading. Outside it,
// each new deploy gets its own reload — the previous boolean guard lasted the
// whole tab session, so a long-lived tab crashed to the error boundary on the
// SECOND deploy that invalidated its chunks.
const RELOAD_COOLDOWN_MS = 60_000;

function retryDynamicImport<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch((firstErr) => {
    // Brief delay before retry so the network/SW has a moment to settle.
    return new Promise<void>((resolve) => setTimeout(resolve, 250))
      .then(factory)
      .catch(() => {
        // Retry also failed — hard reload so the browser re-requests
        // index.html and picks up the current chunk hashes.
        const key = 'chunk-reload-' + window.location.pathname;
        try {
          const lastReloadAt = Number(sessionStorage.getItem(key)) || 0;
          if (Date.now() - lastReloadAt > RELOAD_COOLDOWN_MS) {
            sessionStorage.setItem(key, String(Date.now()));
            window.location.reload();
            // Never-resolving promise: keep React in Suspense state
            // while the page reloads.
            return new Promise<T>(() => {});
          }
        } catch {
          // sessionStorage may be unavailable (private mode, sandbox).
        }
        throw firstErr;
      });
  });
}
