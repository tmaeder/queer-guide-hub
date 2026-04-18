// Service Worker for Queer Guide — optimized for Cloudflare Pages
const STATIC_CACHE = 'static-v9';
const DYNAMIC_CACHE = 'dynamic-v9';
const DYNAMIC_CACHE_LIMIT = 50;

// Cache name prefix used by Today-mode for per-trip offline snapshots.
// Populated from the page via the Cache API directly (see offlineTripPack.ts).
// Kept distinct from STATIC/DYNAMIC so activate-cleanup doesn't wipe it.
const TRIP_SNAPSHOT_PREFIX = 'trip-snapshot-';

// Detect if running on a .onion domain (Tor hidden service)
const IS_ONION = self.location.hostname.endsWith('.onion');

// Precached during install — HTML shell, offline fallback, manifest, + critical pages
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/venues',
  '/events',
  '/resources',
  '/help-hotlines',
  '/map',
];

const CACHE_STRATEGIES = {
  static: /\.(js|css|woff2?|png|jpg|jpeg|webp|avif|svg|ico)$/,
  images: /\.(png|jpg|jpeg|webp|avif|gif|svg)$/
};

// Enable navigation preload if supported
async function enableNavigationPreload() {
  if (self.registration.navigationPreload) {
    await self.registration.navigationPreload.enable();
  }
}

// Trim dynamic cache to size limit (LRU: delete oldest entries first)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await Promise.all(
      keys.slice(0, keys.length - maxItems).map(key => cache.delete(key))
    );
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
    // Do NOT call skipWaiting() — let the app control activation via message
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Clean old caches — preserve current STATIC/DYNAMIC and any
      // trip-snapshot-* cache (those belong to Today-mode and have their
      // own TTL managed from the app).
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name =>
              name !== STATIC_CACHE &&
              name !== DYNAMIC_CACHE &&
              !name.startsWith(TRIP_SNAPSHOT_PREFIX)
            )
            .map(name => caches.delete(name))
        )
      ),
      // Enable navigation preload
      enableNavigationPreload(),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Allow the app to trigger activation of a waiting SW
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Skip external domains — don't cache Supabase API responses (auth data)
  // On .onion domains, block ALL external fetches to prevent Tor circuit leaks
  if (url.origin !== location.origin) {
    if (IS_ONION) {
      event.respondWith(new Response('', { status: 503, statusText: 'Blocked on onion' }));
    }
    return;
  }

  // Navigation requests (HTML pages) — Network First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Use navigation preload response if available
          const preloadResponse = event.preloadResponse && await event.preloadResponse;
          if (preloadResponse) return preloadResponse;

          const networkResponse = await fetch(request);
          if (networkResponse.status === 200) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // Network failed — try cache, then offline fallback
          const cached = await caches.match(request);
          if (cached) return cached;
          const offlinePage = await caches.match('/offline.html');
          return offlinePage || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images) — Cache First
  if (CACHE_STRATEGIES.static.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // Offline fallback for images
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1a1a2e"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#6b7280" font-family="system-ui" font-size="14">Offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
          return new Response('', { status: 503 });
        }
      })()
    );
    return;
  }

  // All other same-origin requests — Network First with cache fallback
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.status === 200) {
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(request, networkResponse.clone());
          trimCache(DYNAMIC_CACHE, DYNAMIC_CACHE_LIMIT);
        }
        return networkResponse;
      } catch {
        const cached = await caches.match(request);
        return cached || new Response('', { status: 503 });
      }
    })()
  );
});

// Handle push notifications
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [100, 50, 100],
    data: payload.data || {},
    actions: payload.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Queer Guide', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const existing = clients.find(c => c.url.includes(targetUrl));
        if (existing) return existing.focus();
        return self.clients.openWindow(targetUrl);
      })
  );
});
