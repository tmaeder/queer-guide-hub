import React, { lazy } from 'react';

/**
 * Retry wrapper for React.lazy — handles chunk load failures after deploys.
 * On failure, tries a hard reload once (gated by sessionStorage to prevent loops).
 */
export function lazyRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err) => {
      // If the chunk failed to load (e.g. after a new deploy changed hashes),
      // try a hard reload once. Use sessionStorage to prevent infinite loops.
      const key = 'chunk-reload-' + window.location.pathname;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a never-resolving promise so React doesn't render the error
        return new Promise(() => {});
      }
      // Already tried reloading — surface the real error
      sessionStorage.removeItem(key);
      throw err;
    }),
  );
}
