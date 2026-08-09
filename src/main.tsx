import './es2022-shims'
import { installSentry } from './sentry'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import i18n from './i18n'
import { initCloudflareOptimizations } from './utils/cloudflareOptimizations'
import { installErrorBuffer, installNetworkBuffer } from '@/utils/feedbackContext'
import { installGlobalErrorSurfacing } from '@/utils/globalErrorSurfacing'
import { installBuildVersionCheck } from '@/utils/buildVersion'
import { installAnalyticsConsentLoader } from '@/utils/analyticsLoader'
import { healBootAssets, healFailedAssets } from '@/utils/assetHeal'

installSentry();
installErrorBuffer();
installNetworkBuffer();
installGlobalErrorSurfacing();
installBuildVersionCheck();
installAnalyticsConsentLoader();

initCloudflareOptimizations();

// Recover from stale-chunk failures after a deploy. Vite emits
// `vite:preloadError` when a `<link rel="modulepreload">` or a dynamic
// `import()` rejects because the requested hashed chunk no longer
// exists (typical post-deploy stale-HTML scenario).
//
// We auto-reload ONLY for failures during initial boot (stale HTML
// referencing chunks that no longer exist). Once the app is interactive,
// a preload failure triggered by a user interaction — e.g. opening a menu
// whose content is a lazy chunk — must NOT hard-reload the page: that
// reloads the whole app out from under the user on every click and, since
// the post-load gate-clear re-armed the reload each time, loops forever.
// Post-boot, we `preventDefault()` so Vite doesn't rethrow, and let the
// component's own lazyRetry/lazyOptional + ErrorBoundary recover quietly.
// The default resource-timing buffer (~250 entries) fills within minutes in
// a long-lived tab (API calls, images), after which new entries are DROPPED —
// including the failed chunk fetch the post-boot heal needs to see. Raise it.
try {
  performance.setResourceTimingBufferSize?.(1000);
} catch {
  /* older engines — heal falls back to the event-payload URL */
}

// Vite's preload error message usually names the failing URL ("Unable to
// preload CSS for /assets/...", "Failed to fetch dynamically imported
// module: https://.../assets/js/..."). Extract it so the heal works even
// when the resource-timing buffer overflowed or hides the status.
function assetUrlFromPreloadError(event: Event): string[] {
  try {
    const message = String(
      (event as Event & { payload?: { message?: unknown } }).payload?.message ?? '',
    );
    const match = message.match(/(?:https?:\/\/[^\s'")]+)?\/assets\/[^\s'")]+/);
    return match ? [new URL(match[0], window.location.origin).toString()] : [];
  } catch {
    return [];
  }
}

let appBooted = false;
let bootRecoveryFired = false;
window.addEventListener('vite:preloadError', (event) => {
  if (appBooted) {
    // Interactive failure — handled gracefully at the component level.
    event.preventDefault();
    // Quietly heal the browser HTTP cache underneath that recovery. A chunk
    // fetched during a deploy window can be a cached-immutable 404/HTML
    // (see src/utils/assetHeal.ts); without the heal, that route chunk
    // replays the poisoned entry on EVERY future visit in this browser.
    void healFailedAssets(assetUrlFromPreloadError(event));
    return;
  }
  // Vite fires one event per failed dependency (a chunk + its CSS = two
  // events in the same tick). Without this latch a single broken document
  // would burn the whole retry budget before its first reload.
  if (bootRecoveryFired) return;
  // Boot-time stale chunk: one-time hard reload to pick up the current
  // index.html / chunk hashes. sessionStorage gate prevents a loop if the
  // file is genuinely broken rather than stale.
  //
  // Reload through a throwaway query param, not a bare location.reload().
  // The stale document lives at the EDGE (observed: `age: 72721` on a
  // `s-maxage=300` route), so re-requesting the same cache key returns the
  // same dead chunk hashes and the retry gate then blocks any further
  // attempt — the exact shape that leaves a route permanently blank. A fresh
  // query string is a different cache key and reaches origin. Mirrors the
  // inline guard in index.html, which catches the entry-script failure this
  // listener cannot see (main.tsx is inside the graph that failed).
  const key = 'preload-error-reload';
  const reloadFresh = () => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('__fresh', String(Date.now()));
      window.location.replace(u.toString());
    } catch {
      window.location.reload();
    }
  };
  // Heal the poisoned cache entries BEFORE the document reload — the reload
  // alone re-imports the same hashed URLs through the browser HTTP cache,
  // which is exactly what pinned a real user blank on 2026-08-08.
  const healThenReload = () => {
    bootRecoveryFired = true;
    void healBootAssets(assetUrlFromPreloadError(event)).finally(reloadFresh);
  };
  // Two attempts, not one: attempt 1 can land while the deploy window is
  // still propagating (heal re-fetches the still-missing chunk), so a second
  // healed retry is what rescues the tab. The counter is shared with the
  // inline index.html guard; a legacy Date.now() value counts as one attempt.
  try {
    const raw = Number(sessionStorage.getItem(key)) || 0;
    const attempts = raw > 1000 ? 1 : raw;
    if (attempts < 2) {
      sessionStorage.setItem(key, String(attempts + 1));
      healThenReload();
    }
  } catch {
    // sessionStorage unavailable (private mode, sandbox) — bound the retry
    // by the URL itself: a document already carrying ?__fresh= IS the retry.
    // (A location.replace navigation reports nav.type 'navigate', never
    // 'reload', so the navigation-type check cannot gate this path.)
    try {
      if (!window.location.search.includes('__fresh=')) healThenReload();
    } catch {
      /* location unavailable — refuse to reload rather than risk a loop */
    }
  }
});

// Mark the app as booted and clear the boot-reload gate after first load,
// so a later transient preload failure doesn't permanently disable the
// boot-time auto-reload recovery for the next cold start.
window.addEventListener(
  'load',
  () => {
    appBooted = true;
    try {
      sessionStorage.removeItem('preload-error-reload');
    } catch {
      /* sandboxed */
    }
    // Drop the cache-busting param the stale-chunk recovery added, so it never
    // reaches the address bar, a shared link, canonical URLs or analytics.
    // replaceState (not a navigation) — the app has already booted from this
    // document and must not re-fetch anything.
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('__fresh')) {
        u.searchParams.delete('__fresh');
        window.history.replaceState(
          window.history.state,
          '',
          u.pathname + (u.search || '') + u.hash,
        );
      }
    } catch {
      /* URL unavailable */
    }
  },
  { once: true },
);

// Non-English locales lazy-load from /locales/<lang>.json via the http
// backend wired in src/i18n. Wait for the active locale before first
// render so non-English visitors don't see an English flash. English
// bundles inline and resolves synchronously.
const SUPPORTED = new Set(['en','es','fr','de','pt','it','ru','zh','ja','ko','ar']);
function activeLocale(): string {
  const seg = window.location.pathname.split('/')[1];
  if (seg && SUPPORTED.has(seg)) return seg;
  let stored: string | null = null;
  try { stored = localStorage.getItem('i18nextLng'); } catch { /* sandboxed */ }
  const fromStorage = stored?.split('-')[0];
  if (fromStorage && SUPPORTED.has(fromStorage)) return fromStorage;
  const fromNav = (navigator.language || '').split('-')[0];
  return fromNav && SUPPORTED.has(fromNav) ? fromNav : 'en';
}

async function bootstrap() {
  const lang = activeLocale();
  if (lang !== 'en') {
    try {
      await i18n.loadLanguages(lang);
      if (i18n.language?.split('-')[0] !== lang) await i18n.changeLanguage(lang);
    } catch {
      // network blip — fall through to render with English fallback.
    }
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
