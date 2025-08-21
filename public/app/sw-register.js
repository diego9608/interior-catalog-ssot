// SW register (CSP compliant: external script, same origin)
(function() {
  'use strict';
  
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return;
  }
  
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js')
      .then(reg => {
        console.log('SW /app registered', reg.scope);
        
        // Check for updates periodically
        if (reg.installing) {
          console.log('SW installing');
        } else if (reg.waiting) {
          console.log('SW waiting');
        } else if (reg.active) {
          console.log('SW active');
        }
      })
      .catch(err => {
        console.error('SW /app registration failed:', err);
      });
  });
})();