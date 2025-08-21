// Dark mode toggle with persistence - minimal SVG version
(function() {
  'use strict';
  
  const KEY = 'ssot.theme';
  
  function isDarkPreferred() {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  function apply(themeDark) {
    document.documentElement.classList.toggle('dark', themeDark);
    const btn = document.getElementById('themeToggle');
    if (btn) {
      // Update aria-label with i18n if available
      if (window.i18n && window.i18n.t) {
        btn.setAttribute('aria-label',
          themeDark ? window.i18n.t('common.theme_light') : window.i18n.t('common.theme_dark')
        );
      } else {
        btn.setAttribute('aria-label',
          themeDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
        );
      }
    }
  }
  
  // Apply on load
  document.addEventListener('DOMContentLoaded', () => {
    apply(isDarkPreferred());
    
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const nowDark = !document.documentElement.classList.contains('dark');
        localStorage.setItem(KEY, nowDark ? 'dark' : 'light');
        apply(nowDark);
      });
    }
  });
  
  // Apply immediately if DOM ready
  if (document.readyState !== 'loading') {
    apply(isDarkPreferred());
  }
})();