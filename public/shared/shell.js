// Shell: sidebar rail/overlay + scrim + scroll-lock
(function () {
  'use strict';

  function isDesktop() { 
    return window.innerWidth >= 1024; 
  }

  function closeOverlay() {
    document.documentElement.removeAttribute('data-sidebar');
    document.body.style.overflow = '';
  }

  function openOverlay() {
    document.documentElement.setAttribute('data-sidebar', 'open');
    // scroll-lock sólo en mobile
    if (!isDesktop()) {
      document.body.style.overflow = 'hidden';
    }
  }

  function toggle() {
    const open = document.documentElement.getAttribute('data-sidebar') === 'open';
    open ? closeOverlay() : openOverlay();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('sidebarToggle') || document.getElementById('menuToggle');
    const scrim = document.querySelector('.scrim') || (() => {
      const s = document.createElement('div'); 
      s.className = 'scrim'; 
      document.body.appendChild(s); 
      return s;
    })();

    // En desktop forzamos rail (sin overlay)
    if (isDesktop()) {
      closeOverlay();
    }

    if (btn) {
      btn.addEventListener('click', toggle);
    }
    
    scrim.addEventListener('click', closeOverlay);
    
    window.addEventListener('keyup', (e) => { 
      if (e.key === 'Escape') closeOverlay(); 
    });
    
    window.addEventListener('resize', () => {
      if (isDesktop()) {
        closeOverlay(); // evita que quede "abierta" al agrandar
      }
    });

    // Reaplicar i18n después de montar shell para que no se vean claves
    if (window.i18n && window.i18n.apply) { 
      window.i18n.apply(document); 
    }
  });
})();