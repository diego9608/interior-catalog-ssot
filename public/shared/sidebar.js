// Sidebar Component JavaScript
(function() {
  'use strict';

  // Sidebar state
  const sidebarState = {
    collapsed: localStorage.getItem('sidebar.collapsed') === 'true',
    mobileOpen: false
  };

  // Navigation items configuration
  const navItems = [
    { id: 'home', icon: '🏠', label: 'sidebar.home', href: '/' },
    { id: 'operations', icon: '📊', label: 'sidebar.operations', href: '/ops/' },
    { id: 'clients', icon: '👥', label: 'sidebar.clients', href: '/clients/' },
    { id: 'suppliers', icon: '📦', label: 'sidebar.suppliers', href: '/suppliers/' },
    { id: 'inventory', icon: '📋', label: 'sidebar.inventory', href: '/inventory/' },
    { id: 'finance', icon: '💰', label: 'sidebar.finance', href: '/finance/' },
    { id: 'reports', icon: '📈', label: 'sidebar.reports', href: '/reports/' },
    { id: 'settings', icon: '⚙️', label: 'sidebar.settings', href: '/settings/' }
  ];

  // Initialize sidebar
  function initSidebar() {
    let sidebar = document.getElementById('sidebar') || document.getElementById('app-sidebar');
    if (!sidebar) {
      // Create sidebar element if it doesn't exist
      sidebar = document.createElement('div');
      sidebar.id = 'sidebar';
      sidebar.className = 'app-sidebar';
      document.body.appendChild(sidebar);
    }

    // Create sidebar HTML with hover-friendly classes
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <a href="/" class="sidebar-logo">
          <span class="sidebar-logo-icon">⟟</span>
          <span class="sidebar-logo-text sidebar-text">SSOT</span>
        </a>
      </div>
      
      <nav class="sidebar-nav" role="navigation">
        <ul class="sidebar-nav-list">
          ${navItems.map(item => `
            <li class="sidebar-nav-item">
              <a href="${item.href}" class="sidebar-nav-link" data-nav-id="${item.id}" title="${item.label.split('.').pop()}">
                <span class="sidebar-nav-icon">${item.icon}</span>
                <span class="sidebar-nav-text sidebar-text" data-i18n="${item.label}">${item.label.split('.').pop()}</span>
              </a>
            </li>
          `).join('')}
        </ul>
      </nav>
      
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-user-avatar">U</div>
          <div class="sidebar-user-info sidebar-text">
            <div class="sidebar-user-name">Usuario</div>
            <div class="sidebar-user-role">Admin</div>
          </div>
        </div>
      </div>
    `;

    // Apply initial state
    if (sidebarState.collapsed) {
      sidebar.classList.add('collapsed');
    }

    // Setup event listeners
    setupSidebarEvents();
    
    // Mark active nav item
    markActiveNavItem();
  }

  // Setup sidebar events
  function setupSidebarEvents() {
    // Toggle button
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleSidebar);
    }

    // Mobile menu button
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', toggleMobileSidebar);
    }

    // Overlay click
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeMobileSidebar);
    }

    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebarState.mobileOpen) {
        closeMobileSidebar();
      }
    });

    // Handle resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth > 768) {
          closeMobileSidebar();
        }
      }, 250);
    });
  }

  // Toggle sidebar collapsed state
  function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    sidebarState.collapsed = !sidebarState.collapsed;
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar.collapsed', sidebarState.collapsed);
  }

  // Toggle mobile sidebar
  function toggleMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (!sidebar) return;

    sidebarState.mobileOpen = !sidebarState.mobileOpen;
    
    if (sidebarState.mobileOpen) {
      sidebar.classList.add('mobile-open');
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      closeMobileSidebar();
    }
  }

  // Close mobile sidebar
  function closeMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
    
    sidebarState.mobileOpen = false;
    document.body.style.overflow = '';
  }

  // Mark active navigation item
  function markActiveNavItem() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.sidebar-nav-link');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      
      // Exact match for home, prefix match for others
      if (href === '/' && currentPath === '/') {
        link.classList.add('active');
      } else if (href !== '/' && currentPath.startsWith(href)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Create app shell wrapper
  function createAppShell() {
    // Check if we're on a page that should have the sidebar
    const body = document.body;
    const hasShell = body.classList.contains('has-app-shell');
    
    if (!hasShell) return;

    // Wrap existing content
    const mainContent = document.querySelector('main') || document.querySelector('.container');
    if (!mainContent) return;

    // Create sidebar elements
    const sidebar = document.createElement('aside');
    sidebar.id = 'app-sidebar';
    sidebar.className = 'app-sidebar';
    
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    
    // Insert sidebar and overlay
    body.insertBefore(sidebar, body.firstChild);
    body.appendChild(overlay);
    
    // Add app-main wrapper
    const appMain = document.createElement('div');
    appMain.className = 'app-main';
    
    // Move all content except sidebar and overlay into app-main
    while (body.firstChild && body.firstChild !== sidebar && body.firstChild !== overlay && body.firstChild !== appMain) {
      if (body.firstChild === mainContent || body.firstChild.contains(mainContent)) {
        appMain.appendChild(body.firstChild);
      } else {
        body.removeChild(body.firstChild);
      }
    }
    
    body.insertBefore(appMain, overlay);
    
    // Add mobile menu button to header if exists
    const header = appMain.querySelector('header, .app-header, .topbar');
    if (header && !header.querySelector('#mobile-menu-btn')) {
      const mobileBtn = document.createElement('button');
      mobileBtn.id = 'mobile-menu-btn';
      mobileBtn.className = 'mobile-menu-btn';
      mobileBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12h18M3 6h18M3 18h18"/>
        </svg>
      `;
      mobileBtn.setAttribute('aria-label', 'Menu');
      
      // Insert at beginning of header
      const firstChild = header.firstElementChild;
      if (firstChild) {
        header.insertBefore(mobileBtn, firstChild);
      } else {
        header.appendChild(mobileBtn);
      }
    }
  }

  // Public API
  window.Sidebar = {
    init: function() {
      createAppShell();
      initSidebar();
    },
    toggle: toggleSidebar,
    toggleMobile: toggleMobileSidebar,
    closeMobile: closeMobileSidebar,
    markActive: markActiveNavItem
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.Sidebar.init);
  } else {
    window.Sidebar.init();
  }
})();