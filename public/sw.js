/*
  Simple Service Worker for route caching
  Caches specific SPA routes for faster reloads and provides a stale-while-revalidate strategy.
*/
const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  '/',
  '/events',
  '/directory',
  '/travel',
  '/venues',
  '/marketplace',
  '/tags',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate updated SW immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Cleanup old caches
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('app-shell-') && key !== APP_SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle navigations to specific routes
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    if (PRECACHE_URLS.includes(url.pathname)) {
      event.respondWith(staleWhileRevalidateForRoute(url.pathname, request));
      return;
    }
  }
});

async function staleWhileRevalidateForRoute(cacheKey, request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(cacheKey);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  // Return cached immediately if present, else wait for network
  return cached || (await networkPromise) || new Response('Offline', { status: 503 });
}
