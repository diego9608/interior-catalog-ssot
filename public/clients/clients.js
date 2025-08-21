// Clients Portfolio Module
(function() {
  'use strict';
  
  // Sample client data (to be replaced with real data)
  const CLIENTS_DATA = [
    {
      id: 'casa-moderna-01',
      name: 'Casa Moderna Polanco',
      client: 'Familia García',
      location: 'Polanco, CDMX',
      year: 2023,
      category: 'residential',
      style: 'modern',
      images: ['https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80'],
      thumbnail: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&q=80',
      description: 'Diseño minimalista con acabados premium',
      tags: ['cocina', 'closets', 'baños'],
      metrics: { pieces: 245, cost: 850000, timeline: 45 }
    },
    {
      id: 'oficina-corporativa-02',
      name: 'Oficina Corporativa',
      client: 'Tech Solutions SA',
      location: 'Santa Fe, CDMX',
      year: 2023,
      category: 'commercial',
      style: 'contemporary',
      images: ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80'],
      thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80',
      description: 'Espacios de trabajo flexibles y modernos',
      tags: ['recepciones', 'oficinas', 'salas de juntas'],
      metrics: { pieces: 380, cost: 1200000, timeline: 60 }
    },
    {
      id: 'departamento-lomas-03',
      name: 'Departamento Lomas',
      client: 'Sr. Rodriguez',
      location: 'Lomas de Chapultepec',
      year: 2022,
      category: 'residential',
      style: 'classic',
      images: ['https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80'],
      thumbnail: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=400&q=80',
      description: 'Diseño clásico con detalles artesanales',
      tags: ['biblioteca', 'cocina', 'vestidor'],
      metrics: { pieces: 189, cost: 620000, timeline: 35 }
    },
    {
      id: 'hotel-boutique-04',
      name: 'Hotel Boutique',
      client: 'Grupo Hotelero',
      location: 'Roma Norte, CDMX',
      year: 2023,
      category: 'hospitality',
      style: 'industrial',
      images: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80'],
      thumbnail: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400&q=80',
      description: 'Habitaciones con diseño único',
      tags: ['habitaciones', 'lobby', 'restaurante'],
      metrics: { pieces: 520, cost: 2100000, timeline: 90 }
    },
    {
      id: 'casa-campo-05',
      name: 'Casa de Campo',
      client: 'Familia Mendez',
      location: 'Valle de Bravo',
      year: 2022,
      category: 'residential',
      style: 'rustic',
      images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80'],
      thumbnail: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80',
      description: 'Estilo rústico con maderas naturales',
      tags: ['cocina', 'recámaras', 'terraza'],
      metrics: { pieces: 312, cost: 980000, timeline: 55 }
    },
    {
      id: 'restaurante-06',
      name: 'Restaurante Gastronómico',
      client: 'Chef Martinez',
      location: 'Condesa, CDMX',
      year: 2023,
      category: 'hospitality',
      style: 'modern',
      images: ['https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=80'],
      thumbnail: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400&q=80',
      description: 'Concepto abierto con cocina visible',
      tags: ['barra', 'cocina', 'comedor'],
      metrics: { pieces: 285, cost: 780000, timeline: 40 }
    }
  ];
  
  // State
  let currentFilter = 'all';
  let searchQuery = '';
  let selectedClient = null;
  
  // DOM Elements
  let gallery, searchInput, filterChips, modal;
  
  // Initialize
  function init() {
    if (!document.querySelector('.clients-container')) {
      updatePlaceholder();
      return;
    }
    
    setupDOM();
    setupEventListeners();
    renderGallery();
    setupLazyLoading();
  }
  
  // Update placeholder to actual portfolio
  function updatePlaceholder() {
    const placeholder = document.querySelector('.placeholder-container');
    if (!placeholder) return;
    
    const container = document.createElement('div');
    container.className = 'clients-container';
    container.innerHTML = `
      <section class="clients-hero">
        <h1 class="clients-title" data-i18n="clients.title">Portafolio de Clientes</h1>
        <p class="clients-subtitle">Proyectos realizados desde 2017</p>
      </section>
      
      <section class="search-section">
        <div class="search-container">
          <input type="search" class="search-input" placeholder="Buscar cliente, proyecto o ubicación..." aria-label="Buscar proyectos">
          <button class="search-btn" aria-label="Buscar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        </div>
        
        <div class="filter-chips">
          <button class="filter-chip active" data-filter="all">Todos</button>
          <button class="filter-chip" data-filter="residential">Residencial</button>
          <button class="filter-chip" data-filter="commercial">Comercial</button>
          <button class="filter-chip" data-filter="hospitality">Hospitalidad</button>
          <button class="filter-chip" data-filter="2023">2023</button>
          <button class="filter-chip" data-filter="2022">2022</button>
        </div>
      </section>
      
      <section class="clients-gallery" id="gallery">
        <!-- Gallery items will be inserted here -->
      </section>
      
      <!-- Client Detail Modal -->
      <div class="client-modal" id="clientModal">
        <div class="client-modal-content">
          <button class="client-modal-close" aria-label="Cerrar">×</button>
          <div id="modalContent"></div>
        </div>
      </div>
    `;
    
    placeholder.parentElement.replaceChild(container, placeholder);
    
    // Re-initialize with actual content
    init();
  }
  
  // Setup DOM references
  function setupDOM() {
    gallery = document.getElementById('gallery');
    searchInput = document.querySelector('.search-input');
    filterChips = document.querySelectorAll('.filter-chip');
    modal = document.getElementById('clientModal');
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Search
    if (searchInput) {
      searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    // Filters
    filterChips.forEach(chip => {
      chip.addEventListener('click', handleFilter);
    });
    
    // Modal close
    const modalClose = document.querySelector('.client-modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', closeModal);
    }
    
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal?.classList.contains('active')) {
        closeModal();
      }
    });
  }
  
  // Render gallery
  function renderGallery() {
    if (!gallery) return;
    
    const filtered = filterClients();
    
    if (filtered.length === 0) {
      gallery.innerHTML = `
        <div class="no-results">
          <p>No se encontraron proyectos</p>
        </div>
      `;
      return;
    }
    
    gallery.innerHTML = filtered.map(client => `
      <article class="client-card" data-id="${client.id}" tabindex="0" role="button" aria-label="Ver proyecto ${client.name}">
        <div class="client-card-image">
          <img data-src="${client.thumbnail}" alt="${client.name}" class="lazy">
          <div class="client-card-overlay">
            <span class="client-card-category">${getCategoryLabel(client.category)}</span>
          </div>
        </div>
        <div class="client-card-content">
          <h3 class="client-card-title">${client.name}</h3>
          <p class="client-card-client">${client.client}</p>
          <div class="client-card-meta">
            <span class="client-card-location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              ${client.location}
            </span>
            <span class="client-card-year">${client.year}</span>
          </div>
          <div class="client-card-tags">
            ${client.tags.slice(0, 3).map(tag => `<span class="client-tag">${tag}</span>`).join('')}
          </div>
        </div>
      </article>
    `).join('');
    
    // Add click handlers to cards
    document.querySelectorAll('.client-card').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(card.dataset.id);
        }
      });
    });
    
    // Trigger lazy loading
    setupLazyLoading();
  }
  
  // Filter clients
  function filterClients() {
    let filtered = [...CLIENTS_DATA];
    
    // Apply category/year filter
    if (currentFilter !== 'all') {
      if (['residential', 'commercial', 'hospitality'].includes(currentFilter)) {
        filtered = filtered.filter(c => c.category === currentFilter);
      } else if (/^\d{4}$/.test(currentFilter)) {
        filtered = filtered.filter(c => c.year === parseInt(currentFilter));
      }
    }
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.client.toLowerCase().includes(query) ||
        c.location.toLowerCase().includes(query) ||
        c.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }
  
  // Handle search
  function handleSearch(e) {
    searchQuery = e.target.value;
    renderGallery();
  }
  
  // Handle filter
  function handleFilter(e) {
    const filter = e.target.dataset.filter;
    
    // Update active state
    filterChips.forEach(chip => chip.classList.remove('active'));
    e.target.classList.add('active');
    
    currentFilter = filter;
    renderGallery();
  }
  
  // Open modal
  function openModal(clientId) {
    const client = CLIENTS_DATA.find(c => c.id === clientId);
    if (!client) return;
    
    selectedClient = client;
    
    const modalContent = document.getElementById('modalContent');
    modalContent.innerHTML = `
      <div class="modal-header">
        <img src="${client.images[0]}" alt="${client.name}" class="modal-image">
      </div>
      <div class="modal-body">
        <h2 class="modal-title">${client.name}</h2>
        <p class="modal-client">${client.client} • ${client.year}</p>
        <p class="modal-location">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${client.location}
        </p>
        <p class="modal-description">${client.description}</p>
        
        <div class="modal-metrics">
          <div class="metric">
            <span class="metric-value">${client.metrics.pieces}</span>
            <span class="metric-label">Piezas</span>
          </div>
          <div class="metric">
            <span class="metric-value">$${(client.metrics.cost / 1000).toFixed(0)}k</span>
            <span class="metric-label">Inversión</span>
          </div>
          <div class="metric">
            <span class="metric-value">${client.metrics.timeline}</span>
            <span class="metric-label">Días</span>
          </div>
        </div>
        
        <div class="modal-tags">
          ${client.tags.map(tag => `<span class="client-tag">${tag}</span>`).join('')}
        </div>
      </div>
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  
  // Close modal
  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    selectedClient = null;
  }
  
  // Lazy loading
  function setupLazyLoading() {
    const images = document.querySelectorAll('.lazy');
    
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            img.classList.add('loaded');
            observer.unobserve(img);
          }
        });
      });
      
      images.forEach(img => imageObserver.observe(img));
    } else {
      // Fallback for older browsers
      images.forEach(img => {
        img.src = img.dataset.src;
        img.classList.remove('lazy');
      });
    }
  }
  
  // Helpers
  function getCategoryLabel(category) {
    const labels = {
      residential: 'Residencial',
      commercial: 'Comercial',
      hospitality: 'Hospitalidad'
    };
    return labels[category] || category;
  }
  
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();