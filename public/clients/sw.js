// Service Worker for clients portfolio offline support
const CACHE_NAME = 'clients-portfolio-v1';
const IMAGE_CACHE = 'clients-images-v1';

const urlsToCache = [
  '/clients/',
  '/clients/index.html',
  '/clients/clients.js',
  '/clients/clients.css',
  '/shared/tokens.css',
  '/shared/sidebar.css',
  '/shared/sidebar.js',
  '/shared/theme.js',
  '/shared/i18n.js',
  '/fonts/Inter-Variable.woff2',
  '/i18n/es.json',
  '/i18n/en.json'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Clients SW] Opened cache');
        return cache.addAll(urlsToCache);
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
          if (cacheName.startsWith('clients-') && cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE) {
            console.log('[Clients SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - cache strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Image caching strategy (cache-first with network fallback)
  if (request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache => {
        return cache.match(request).then(response => {
          if (response) {
            // Return cached image
            return response;
          }
          
          // Fetch from network and cache
          return fetch(request).then(networkResponse => {
            // Only cache successful responses
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Return placeholder image if offline
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#f0f0f0"/><text x="50%" y="50%" text-anchor="middle" fill="#999" font-family="sans-serif" font-size="20">Imagen no disponible</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          });
        });
      })
    );
    return;
  }
  
  // Stale-while-revalidate for HTML/CSS/JS
  if (url.pathname.startsWith('/clients/') || url.pathname.startsWith('/shared/')) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          // Update cache in background
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
        
        // Return cached response immediately, update in background
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
  
  // Default network-first strategy
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

// Message handling for cache management
self.addEventListener('message', event => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data.action === 'clearCache') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.filter(name => name.startsWith('clients-'))
            .map(name => caches.delete(name))
        );
      })
    );
  }
});