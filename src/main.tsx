import './sentry'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import i18n from './i18n'
import { initCloudflareOptimizations } from './utils/cloudflareOptimizations'
import { installErrorBuffer, installNetworkBuffer } from '@/utils/feedbackContext'
import { installGlobalErrorSurfacing } from '@/utils/globalErrorSurfacing'
import { installBuildVersionCheck } from '@/utils/buildVersion'
import { installAnalyticsConsentLoader } from '@/utils/analyticsLoader'

installErrorBuffer();
installNetworkBuffer();
installGlobalErrorSurfacing();
installBuildVersionCheck();
installAnalyticsConsentLoader();

initCloudflareOptimizations();

// Recover from stale-chunk failures after a deploy. Vite emits
// `vite:preloadError` when a `<link rel="modulepreload">` or a dynamic
// `import()` rejects because the requested hashed chunk no longer
// exists (typical post-deploy stale-HTML scenario). We try a one-time
// hard reload — the new index.html will reference the current chunk
// hashes. A sessionStorage gate prevents an infinite reload loop if
// the file is genuinely broken rather than stale.
window.addEventListener('vite:preloadError', () => {
  const key = 'preload-error-reload';
  try {
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  } catch {
    // sessionStorage unavailable (private mode, sandbox) — best-effort
    // reload anyway; this path is rare.
    window.location.reload();
  }
});

// Clear the gate after a successful boot so a single transient preload
// failure doesn't permanently disable the auto-reload recovery for the
// rest of the session.
window.addEventListener(
  'load',
  () => {
    try {
      sessionStorage.removeItem('preload-error-reload');
    } catch {
      /* sandboxed */
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
