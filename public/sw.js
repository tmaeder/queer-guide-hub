// Service Worker optimized for Cloudflare Pages
const CACHE_NAME = 'queer-guide-v3';
const STATIC_CACHE = 'static-v2';
const DYNAMIC_CACHE = 'dynamic-v2';

// Only cache the HTML shell and manifest - JS/CSS have hashed filenames
// and are cached via Cache-Control: immutable headers
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Assets to cache on first request
const CACHE_STRATEGIES = {
  // Static assets - cache first
  static: /\.(js|css|woff2?|png|jpg|jpeg|webp|avif|svg|ico)$/,
  // Images - cache first with network fallback
  images: /\.(png|jpg|jpeg|webp|avif|gif|svg)$/,
  // HTML - network first
  html: /\.html$|\/$/
};

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName =>
              cacheName !== STATIC_CACHE &&
              cacheName !== DYNAMIC_CACHE
            )
            .map(cacheName => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip external domains - don't cache Supabase API responses (auth data!)
  if (url.origin !== location.origin && !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // Static assets - Cache First strategy
  if (CACHE_STRATEGIES.static.test(url.pathname)) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then(response => {
              if (response.status === 200) {
                const responseClone = response.clone();
                caches.open(STATIC_CACHE)
                  .then(cache => cache.put(request, responseClone));
              }
              return response;
            });
        })
        .catch(() => {
          // Return offline fallback for images
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f3f4f6"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#6b7280">Image unavailable</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        })
    );
    return;
  }

  // HTML pages - Network First with cache fallback
  if (CACHE_STRATEGIES.html.test(url.pathname) || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cachedResponse => {
              return cachedResponse || caches.match('/index.html');
            });
        })
    );
    return;
  }

  // Default: try network first, fallback to cache
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});

// Handle background sync for Cloudflare compatibility
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(Promise.resolve());
  }
});

// Handle push notifications
self.addEventListener('push', event => {
  if (!event.data) return;

  const options = {
    body: event.data.text(),
    icon: '/icons/icon-512.png',
    badge: '/icons/icon-512.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('Queer Guide', options)
  );
});
