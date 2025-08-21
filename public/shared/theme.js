// Dark mode toggle with persistence
(function() {
  'use strict';
  
  const THEME_KEY = 'ssot.theme';
  
  // Apply theme to document
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };
  
  // Get initial theme (stored preference or system preference)
  const getInitialTheme = () => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  };
  
  // Apply initial theme immediately to prevent flash
  applyTheme(getInitialTheme());
  
  // Setup toggle button when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('themeToggle');
    if (!toggleBtn) return;
    
    // Update button icon based on current theme
    const updateButtonIcon = () => {
      const isDark = document.documentElement.classList.contains('dark');
      toggleBtn.textContent = isDark ? '☀️' : '🌙';
      toggleBtn.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    };
    
    // Initial icon
    updateButtonIcon();
    
    // Toggle handler
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      localStorage.setItem(THEME_KEY, nextTheme);
      applyTheme(nextTheme);
      updateButtonIcon();
      
      // Optional: dispatch custom event for other components
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));
    });
  });
  
  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only apply if user hasn't manually set a preference
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
})();