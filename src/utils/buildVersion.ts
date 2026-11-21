/**
 * Build-version detection. Pairs with the chunk-recovery layer in
 * `lazyRetry`, `main.tsx` (`vite:preloadError` listener) and `sw.js`
 * (content-type guard). Where those react *after* a chunk-load failure,
 * this layer proactively detects that a new build has shipped and
 * prompts the user to reload before they hit the failure.
 *
 * Mechanism:
 *  - The boot build ID is read from the `qg-build-id` meta tag in index.html
 *    (`src/utils/buildId.ts`; written by `vite.config.ts`).
 *  - `/build-id.txt` is emitted at build time and served by CF Pages
 *    with a short cache.
 *  - On `visibilitychange` (hidden → visible) we fetch the file with
 *    `cache: 'no-store'` and compare. A mismatch surfaces a single
 *    toast offering a reload. Polling is gated to once per ~5 min to
 *    avoid hammering the edge.
 */
import { toast } from 'sonner';
import i18n from '@/i18n';
import { readBuildId } from '@/utils/buildId';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BUILD_ID_URL = '/build-id.txt';

let bootBuildId: string | null = null;
let lastCheckedAt = 0;
let alreadyNotified = false;

function getBootBuildId(): string {
  if (bootBuildId !== null) return bootBuildId;
  // 'dev' when the page has no build-id meta, so we never toast in local dev.
  bootBuildId = readBuildId();
  return bootBuildId;
}

async function fetchCurrentBuildId(): Promise<string | null> {
  try {
    const res = await fetch(BUILD_ID_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // If a stale SPA fallback returns HTML here, treat as no-signal.
    if (ct.includes('text/html')) return null;
    return (await res.text()).trim() || null;
  } catch {
    return null;
  }
}

async function checkOnce(): Promise<void> {
  if (alreadyNotified) return;
  const now = Date.now();
  if (now - lastCheckedAt < CHECK_INTERVAL_MS) return;
  lastCheckedAt = now;

  const boot = getBootBuildId();
  if (boot === 'dev') return;

  const current = await fetchCurrentBuildId();
  if (!current || current === boot) return;

  alreadyNotified = true;
  toast.info(i18n.t('pwa.updateAvailable.title'), {
    description: i18n.t('pwa.updateAvailable.description'),
    action: {
      label: i18n.t('pwa.updateAvailable.action'),
      onClick: () => window.location.reload(),
    },
    duration: Infinity,
  });
}

export function installBuildVersionCheck(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  getBootBuildId();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkOnce();
    }
  });

  // One opportunistic check ~30s after boot in case the user keeps the
  // tab in the foreground.
  setTimeout(() => {
    void checkOnce();
  }, 30_000);
}
