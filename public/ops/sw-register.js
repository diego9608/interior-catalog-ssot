// SW register for /ops (CSP compliant: external script)
(function() {
  'use strict';
  
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return;
  }
  
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/ops/sw.js')
      .then(reg => {
        console.log('SW /ops registered', reg.scope);
        
        // Handle updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          console.log('New SW version found for /ops');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New SW version available - refresh to update');
            }
          });
        });
      })
      .catch(err => {
        console.error('SW /ops registration failed:', err);
      });
  });
})();