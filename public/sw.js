// Service Worker for Queer Guide PWA
const CACHE_NAME = 'queer-guide-v1';
const API_CACHE_NAME = 'queer-guide-api-v1';
const STATIC_CACHE_NAME = 'queer-guide-static-v1';

// Critical resources to cache immediately
const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
  '/manifest.json'
];

// API endpoints to cache with strategies
const API_PATTERNS = [
  /\/rest\/v1\/venues/,
  /\/rest\/v1\/events/,
  /\/rest\/v1\/marketplace/,
  /\/rest\/v1\/news/,
  /\/rest\/v1\/countries/,
  /\/rest\/v1\/cities/
];

// Install event - cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (![CACHE_NAME, API_CACHE_NAME, STATIC_CACHE_NAME].includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http requests
  if (!request.url.startsWith('http')) return;

  // API requests - Cache First strategy with fallback
  if (isApiRequest(url)) {
    event.respondWith(apiCacheStrategy(request));
    return;
  }

  // Static assets - Cache First strategy
  if (isStaticAsset(url)) {
    event.respondWith(staticCacheStrategy(request));
    return;
  }

  // Navigation requests - Network First with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // Default strategy - Network First
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Check if request is for API
function isApiRequest(url) {
  return url.hostname.includes('supabase.co') || 
         API_PATTERNS.some(pattern => pattern.test(url.pathname));
}

// Check if request is for static asset
function isStaticAsset(url) {
  return url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ico)$/);
}

// API Cache Strategy - Cache First with 5 minute TTL
async function apiCacheStrategy(request) {
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      const cachedDate = new Date(cachedResponse.headers.get('sw-cached-date') || 0);
      const now = new Date();
      const fiveMinutes = 5 * 60 * 1000;
      
      // If cache is fresh, return it and update in background
      if (now - cachedDate < fiveMinutes) {
        // Background update
        fetch(request).then(response => {
          if (response.ok) {
            const responseToCache = response.clone();
            responseToCache.headers.set('sw-cached-date', now.toISOString());
            cache.put(request, responseToCache);
          }
        }).catch(() => {});
        
        return cachedResponse;
      }
    }

    // Try network first
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      responseToCache.headers.set('sw-cached-date', new Date().toISOString());
      cache.put(request, responseToCache);
    }
    return networkResponse;

  } catch (error) {
    // Network failed, return cache if available
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Static Cache Strategy - Cache First
async function staticCacheStrategy(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    throw error;
  }
}

// Navigation Strategy - Network First with cache fallback
async function navigationStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request) || await cache.match('/');
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Handle offline queue here
  console.log('Background sync triggered');
}

// Message handling for cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    caches.delete(API_CACHE_NAME);
  }
});