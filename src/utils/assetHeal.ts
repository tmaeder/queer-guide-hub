/**
 * Browser HTTP-cache healer for poisoned hashed assets.
 *
 * `public/_headers` stamps `/assets/*` with `max-age=31536000, immutable`,
 * and Cloudflare Pages answers a MISSING chunk with the SPA shell
 * (200 text/html) — or, mid-deploy, a 404 — carrying that same header
 * (measured on prod 2026-08-08: a nonexistent hashed path returns
 * `200 text/html` + `immutable`). A browser that requests a chunk during a
 * deploy window can therefore cache the failure FOR A YEAR. No document
 * reload fixes it: the fresh document re-imports the same hashed URL and the
 * module loader replays the poisoned cache entry. Measured on a real user's
 * Chrome after the 2026-08-07 deploy — 8 chunks pinned (entry, router and
 * the /travel route chunks), the `?__fresh=` guard fired on every reload,
 * page stayed blank forever.
 *
 * The ONLY escape is a per-URL `fetch(url, { cache: 'reload' })`, which
 * bypasses the HTTP cache AND rewrites the entry with the fresh response.
 * index.html's inline boot guard carries an ES5 copy of this logic (it must
 * run when the module graph itself is dead); this module is the copy the app
 * uses once it is alive.
 */

type ResourceEntryWithStatus = PerformanceResourceTiming & {
  responseStatus?: number;
};

const HEAL_TIMEOUT_MS = 4000;
// Must exceed the document's own /assets/ reference count (48 measured in the
// shipped index.html) with room for route chunks — a cap below that silently
// truncates away the one poisoned dynamic-chunk URL the boot heal exists for.
const MAX_URLS = 150;

// Loader initiators whose failure can break the app. Excludes img/media —
// a dead picture never blanks the page, and aborted image loads would
// otherwise be re-downloaded full-body on every heal (flaky-network storm).
const CRITICAL_INITIATORS = new Set(['script', 'link', 'css', 'fetch', 'xmlhttprequest']);

function assetPrefix(): string {
  return window.location.origin + '/assets/';
}

function isOwnAssetUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(assetPrefix());
}

/** Every /assets/ URL the current document references directly. */
export function documentAssetUrls(): string[] {
  const urls: string[] = [];
  const els = document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
    'script[src], link[rel="modulepreload"], link[rel="stylesheet"]',
  );
  els.forEach((el) => {
    const url = 'src' in el && el.src ? el.src : (el as HTMLLinkElement).href;
    if (isOwnAssetUrl(url)) urls.push(url);
  });
  return urls;
}

/** Every /assets/ URL this page has attempted to fetch (resource timing). */
export function attemptedAssetUrls(): string[] {
  try {
    return performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter(isOwnAssetUrl);
  } catch {
    return [];
  }
}

/**
 * The /assets/ fetches that look FAILED: an error status where the browser
 * exposes one (`responseStatus`, Chromium), else a completed transfer with an
 * empty body — a hashed chunk is never legitimately zero bytes.
 */
export function failedAssetUrls(): string[] {
  try {
    return performance
      .getEntriesByType('resource')
      .filter((entry) => {
        if (!isOwnAssetUrl(entry.name)) return false;
        const { initiatorType, responseStatus, transferSize, decodedBodySize } =
          entry as ResourceEntryWithStatus;
        if (initiatorType && !CRITICAL_INITIATORS.has(initiatorType)) return false;
        if (typeof responseStatus === 'number' && responseStatus > 0) {
          return responseStatus >= 400;
        }
        return transferSize === 0 && decodedBodySize === 0;
      })
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Re-fetch each URL with `cache: 'reload'`, replacing any poisoned browser
 * cache entry. Always resolves — failures are swallowed (the caller is
 * already in a recovery path) and a hard timeout keeps a dead network from
 * stalling the recovery reload.
 */
export async function healAssetUrls(urls: string[]): Promise<void> {
  const unique = Array.from(new Set(urls)).slice(0, MAX_URLS);
  if (unique.length === 0 || typeof fetch !== 'function') return;
  await Promise.race([
    Promise.allSettled(
      unique.map((url) => fetch(url, { cache: 'reload' }).catch(() => undefined)),
    ),
    new Promise((resolve) => setTimeout(resolve, HEAL_TIMEOUT_MS)),
  ]);
}

/**
 * Boot-time heal: the page is already broken, so heal everything the
 * document references plus everything it tried to load. Call BEFORE the
 * `?__fresh=` document reload — the reload alone re-imports through the
 * poisoned cache and changes nothing. Failed URLs go FIRST: the dedup slice
 * keeps head-of-list entries, and the poisoned dynamic chunk is exactly the
 * URL that is NOT among the document's ~48 static references.
 */
export function healBootAssets(extraUrls: string[] = []): Promise<void> {
  return healAssetUrls([
    ...extraUrls.filter(isOwnAssetUrl),
    ...failedAssetUrls(),
    ...attemptedAssetUrls(),
    ...documentAssetUrls(),
  ]);
}

// URLs already healed in this document's lifetime. Resource-timing entries
// for a failure persist after the heal rewrote the cache, so without this a
// flaky session would re-download the same URLs on every later preloadError.
const healedThisPage = new Set<string>();

/**
 * Post-boot heal: the app is interactive and must not reload, so quietly
 * replace only the cache entries that look failed (plus any URL the caller
 * extracted from the failure event itself). The component-level lazyRetry —
 * or simply the user's next attempt — then fetches a live copy instead of
 * replaying an immutable cached 404 on every future visit.
 */
export function healFailedAssets(extraUrls: string[] = []): Promise<void> {
  const urls = [...extraUrls.filter(isOwnAssetUrl), ...failedAssetUrls()].filter(
    (url) => !healedThisPage.has(url),
  );
  urls.forEach((url) => healedThisPage.add(url));
  return healAssetUrls(urls);
}
