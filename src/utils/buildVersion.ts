/**
 * Build-version detection. Pairs with the chunk-recovery layer in
 * `lazyRetry`, `main.tsx` (`vite:preloadError` listener) and `sw.js`
 * (content-type guard). Where those react *after* a chunk-load failure,
 * this layer proactively detects that a new build has shipped and
 * prompts the user to reload before they hit the failure.
 *
 * Mechanism:
 *  - `__BUILD_ID__` is replaced at build time (see `vite.config.ts`).
 *  - `/build-id.txt` is emitted at build time and served by CF Pages
 *    with a short cache.
 *  - On `visibilitychange` (hidden → visible) we fetch the file with
 *    `cache: 'no-store'` and compare. A mismatch surfaces a single
 *    toast offering a reload. Polling is gated to once per ~5 min to
 *    avoid hammering the edge.
 */
import { toast } from 'sonner';

// Replaced at build time by the `define` block in vite.config.ts.
// Falls back to 'dev' so we never accidentally toast in local dev.
declare const __BUILD_ID__: string;

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BUILD_ID_URL = '/build-id.txt';

let bootBuildId: string | null = null;
let lastCheckedAt = 0;
let alreadyNotified = false;

function getBootBuildId(): string {
  if (bootBuildId !== null) return bootBuildId;
  try {
    bootBuildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
  } catch {
    bootBuildId = 'dev';
  }
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
  toast('A new version is available', {
    description: 'Reload to get the latest update.',
    action: {
      label: 'Reload',
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
