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
let appBooted = false;
window.addEventListener('vite:preloadError', (event) => {
  if (appBooted) {
    // Interactive failure — handled gracefully at the component level.
    event.preventDefault();
    return;
  }
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
  try {
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, String(Date.now()));
      reloadFresh();
    }
  } catch {
    // sessionStorage unavailable (private mode, sandbox) — best-effort
    // reload anyway; this path is rare.
    reloadFresh();
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
