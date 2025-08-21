// Service Worker for /ops - handles offline and API caching
const OPS_CACHE = 'ops-static-v5';
const OPS_API_CACHE = 'ops-api-v3';
const OPS_HISTORY_CACHE = 'ops-history-v1';

const STATIC_ASSETS = [
  '/ops/',
  '/ops/index.html',
  '/ops/styles.css',
  '/ops/ops.js',
  '/ops/ops-trends.js',
  '/shared/tokens.css',
  '/shared/theme.js',
  '/shared/i18n.js',
  '/fonts/Inter-Variable.woff2'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(OPS_CACHE)
      .then(cache => {
        console.log('Caching ops static assets');
        return cache.addAll(STATIC_ASSETS);
      })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (![OPS_CACHE, OPS_API_CACHE, OPS_HISTORY_CACHE].includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - handle requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // History endpoints - stale-while-revalidate
  if (url.pathname === '/api/ops/history.json' || url.pathname.includes('/api/ops/snapshots/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OPS_HISTORY_CACHE);
        const cachedResponse = await cache.match(request);
        
        // Return cached immediately if available
        if (cachedResponse) {
          // But also fetch fresh in background
          fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
          }).catch(() => {});
          
          return cachedResponse;
        }
        
        // No cache, fetch and cache
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          // Return empty history as fallback
          return new Response(
            JSON.stringify([]),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
    return;
  }
  
  // API ops endpoints - network-first with cache fallback
  if (url.pathname.startsWith('/api/ops/')) {
    event.respondWith(
      (async () => {
        try {
          // Try network first
          const networkResponse = await fetch(request);
          
          // Cache successful responses
          if (networkResponse.ok) {
            const cache = await caches.open(OPS_API_CACHE);
            cache.put(request, networkResponse.clone());
          }
          
          return networkResponse;
        } catch (error) {
          // Network failed, try cache
          console.log('Network failed for ops API, checking cache:', url.pathname);
          
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            console.log('Serving from cache:', url.pathname);
            return cachedResponse;
          }
          
          // No cache, return empty JSON
          console.log('No cache for:', url.pathname);
          return new Response(
            JSON.stringify([]),
            {
              headers: {
                'Content-Type': 'application/json',
                'X-SW-Fallback': 'true'
              }
            }
          );
        }
      })()
    );
    return;
  }
  
  // Static assets - cache-first
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Not in cache, fetch and cache for next time
          return fetch(request).then(response => {
            // Don't cache non-successful responses
            if (!response.ok) {
              return response;
            }
            
            // Clone and cache the response
            return caches.open(OPS_CACHE).then(cache => {
              cache.put(request, response.clone());
              return response;
            });
          });
        })
    );
    return;
  }
  
  // Default - pass through
  event.respondWith(fetch(request));
});