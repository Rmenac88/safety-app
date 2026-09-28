/**
 * 🛡️ SAFETY HIGH-PERFORMANCE SERVICE WORKER
 *
 * Strategies:
 * - HTML, JS, CSS: Network First with Cache Fallback (guarantees latest styles on deploy)
 * - Map Tiles & Web Fonts: Stale-While-Revalidate (instant rendering & offline caching)
 * - API Endpoints: Network First with Offline Cache
 */

const CACHE_VERSION = 'safety-v5.2-' + Date.now();
const STATIC_CACHE = 'safety-static-' + CACHE_VERSION;
const TILES_CACHE = 'safety-tiles-' + CACHE_VERSION;
const API_CACHE = 'safety-api-' + CACHE_VERSION;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!key.includes(CACHE_VERSION)) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // 1. Map Tiles & Fonts: Network First with cache fallback (ensures fresh non-empty vector tiles)
  if (
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('fastly.net') ||
    url.hostname.includes('openfreemap.org') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      fetch(request)
        .then((networkRes) => {
          if (networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(TILES_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cache = await caches.open(TILES_CACHE);
          return cache.match(request);
        })
    );
    return;
  }

  // 2. API: Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 3. App Shell, JS & CSS Bundles: Network First ALWAYS to prevent 404 broken stylesheets
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});
