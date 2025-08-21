// Service Worker registration for clients module
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/clients/sw.js', { scope: '/clients/' })
      .then(reg => {
        console.log('[Clients] Service Worker registered', reg.scope);
        
        // Handle updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[Clients] New content available, refresh to update');
            }
          });
        });
      })
      .catch(err => {
        console.warn('[Clients] Service Worker registration failed', err);
      });
  });
}