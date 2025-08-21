// Service Worker for offline functionality
const CACHE_NAME = 'ssot-field-v3';
const API_CACHE = 'ssot-api-v2';
const urlsToCache = [
  '/app/',
  '/app/index.html',
  '/app/app.js',
  '/app/styles.css',
  '/app/manifest.webmanifest',
  '/shared/tokens.css',
  '/shared/theme.js',
  '/fonts/Inter-Variable.woff2',
  '/api/projects.json',
  '/api/DEMO-001/checklists.json',
  '/api/DEMO-001/meta.json'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Fetch event - cache strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Special handling for /api/ops/* endpoints
  if (url.pathname.startsWith('/api/ops/')) {
    event.respondWith(
      (async () => {
        try {
          // Try network first for ops API
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            // Cache the response
            const cache = await caches.open(API_CACHE);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }
        } catch (error) {
          // Network failed, try cache
          console.log('Network failed for ops API, trying cache');
        }
        
        // Fallback to cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Return empty JSON as last resort
        return new Response(
          JSON.stringify([]),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })()
    );
    return;
  }
  
  // Default cache-first strategy for other resources
  event.respondWith(
    caches.match(request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });

          return response;
        }).catch(() => {
          // Offline fallback
          console.log('Offline - returning cached version if available');
          return caches.match(request);
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME, API_CACHE];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});