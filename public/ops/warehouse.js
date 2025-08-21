// Warehouse module for ops dashboard
(function() {
  'use strict';

  window.warehouse = window.warehouse || {};
  
  const state = {
    offcuts: [],
    transactions: [],
    locations: [],
    stats: {},
    filters: {
      material: '',
      thickness: '',
      status: 'all',
      location: '',
      search: ''
    },
    selectedOffcuts: new Set(),
    txBuffer: []
  };

  // Load warehouse data
  window.warehouse.loadData = async function() {
    try {
      const [offcutsRes, txRes, locRes, statsRes] = await Promise.all([
        fetch('/api/warehouse/offcuts.json'),
        fetch('/api/warehouse/transactions.json'),
        fetch('/api/warehouse/locations.json'),
        fetch('/api/warehouse/stats.json')
      ]);
      
      state.offcuts = await offcutsRes.json();
      state.transactions = await txRes.json();
      state.locations = await locRes.json();
      state.stats = await statsRes.json();
      
      // Load local transaction buffer
      const buffer = localStorage.getItem('wh.tx.buffer');
      if (buffer) {
        state.txBuffer = JSON.parse(buffer);
      }
      
      window.warehouse.renderInventory();
      window.warehouse.updateKPIs();
    } catch (error) {
      console.error('Error loading warehouse data:', error);
    }
  };

  // Update KPI cards
  window.warehouse.updateKPIs = function() {
    const kpis = document.getElementById('warehouse-kpis');
    if (!kpis) return;
    
    kpis.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label" data-i18n="wh.available">Disponibles</div>
        <div class="kpi-value">${state.stats.counts?.available || 0}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" data-i18n="wh.totalArea">Área Total</div>
        <div class="kpi-value">${(state.stats.area_m2?.available || 0).toFixed(2)} m²</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" data-i18n="wh.reserved">Reservadas</div>
        <div class="kpi-value">${state.stats.counts?.reserved || 0}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" data-i18n="wh.consumedYTD">Consumidas YTD</div>
        <div class="kpi-value">${state.stats.counts?.consumed || 0}</div>
      </div>
    `;
  };

  // Render inventory table
  window.warehouse.renderInventory = function() {
    const tbody = document.getElementById('warehouse-tbody');
    if (!tbody) return;
    
    // Apply filters
    let filtered = [...state.offcuts];
    
    if (state.filters.material) {
      filtered = filtered.filter(o => 
        o.material_name.toLowerCase().includes(state.filters.material.toLowerCase())
      );
    }
    
    if (state.filters.thickness) {
      filtered = filtered.filter(o => 
        o.thickness_mm === parseInt(state.filters.thickness)
      );
    }
    
    if (state.filters.status !== 'all') {
      filtered = filtered.filter(o => o.status === state.filters.status);
    }
    
    if (state.filters.location) {
      filtered = filtered.filter(o => 
        o.location.toLowerCase().includes(state.filters.location.toLowerCase())
      );
    }
    
    if (state.filters.search) {
      const search = state.filters.search.toLowerCase();
      filtered = filtered.filter(o => 
        o.id.toLowerCase().includes(search) ||
        o.material_code.toLowerCase().includes(search)
      );
    }
    
    // Sort by updated_at desc
    filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    
    // Render rows
    tbody.innerHTML = '';
    filtered.forEach(offcut => {
      const tr = document.createElement('tr');
      tr.dataset.id = offcut.id;
      
      const statusClass = {
        available: 'badge pass',
        reserved: 'badge pending',
        consumed: 'badge fail',
        scrap: 'badge'
      }[offcut.status] || 'badge';
      
      tr.innerHTML = `
        <td>
          <input type="checkbox" class="offcut-select" value="${offcut.id}" 
            ${state.selectedOffcuts.has(offcut.id) ? 'checked' : ''}>
        </td>
        <td class="offcut-id">${offcut.id}</td>
        <td>${offcut.material_name}</td>
        <td>${offcut.thickness_mm}mm</td>
        <td>${offcut.w_mm}×${offcut.h_mm}</td>
        <td>${offcut.area_m2.toFixed(3)} m²</td>
        <td>${offcut.location}</td>
        <td><span class="${statusClass}">${offcut.status.toUpperCase()}</span></td>
        <td>${offcut.origin?.project_id || '—'}</td>
        <td>${new Date(offcut.updated_at).toLocaleDateString()}</td>
      `;
      
      tbody.appendChild(tr);
    });
    
    // Bind checkbox events
    document.querySelectorAll('.offcut-select').forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          state.selectedOffcuts.add(e.target.value);
        } else {
          state.selectedOffcuts.delete(e.target.value);
        }
      });
    });
  };

  // Quick actions
  window.warehouse.newOffcut = function() {
    const form = `
      <div class="modal-content">
        <h3 data-i18n="wh.newOffcut">Nuevo Remanente</h3>
        <form id="new-offcut-form">
          <input type="text" id="material-code" placeholder="Código Material" required>
          <input type="text" id="material-name" placeholder="Nombre Material" required>
          <input type="number" id="thickness" placeholder="Espesor (mm)" required>
          <input type="text" id="color" placeholder="Color" required>
          <select id="grain">
            <option value="X">Sin veta</option>
            <option value="H">Horizontal</option>
            <option value="V">Vertical</option>
          </select>
          <input type="number" id="width" placeholder="Ancho (mm)" required>
          <input type="number" id="height" placeholder="Alto (mm)" required>
          <select id="location">${
            state.locations.map(loc => 
              `<option value="${loc.id}">${loc.name}</option>`
            ).join('')
          }</select>
          <input type="text" id="project-origin" placeholder="Proyecto origen">
          <textarea id="notes" placeholder="Notas"></textarea>
          <button type="submit" class="btn btn-primary">Crear</button>
          <button type="button" onclick="warehouse.closeModal()">Cancelar</button>
        </form>
      </div>
    `;
    
    window.warehouse.showModal(form);
    
    document.getElementById('new-offcut-form').addEventListener('submit', (e) => {
      e.preventDefault();
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const nextId = state.offcuts.filter(o => o.id.startsWith(`OC-${dateStr}`)).length + 1;
      const id = `OC-${dateStr}-${String(nextId).padStart(4, '0')}`;
      
      const width = parseInt(document.getElementById('width').value);
      const height = parseInt(document.getElementById('height').value);
      const area = (width * height) / 1000000;
      
      const offcut = {
        id,
        material_code: document.getElementById('material-code').value,
        material_name: document.getElementById('material-name').value,
        thickness_mm: parseInt(document.getElementById('thickness').value),
        color: document.getElementById('color').value,
        grain: document.getElementById('grain').value,
        w_mm: width,
        h_mm: height,
        area_m2: area,
        location: document.getElementById('location').value,
        status: 'available',
        origin: {
          project_id: document.getElementById('project-origin').value || null,
          sheet_id: null
        },
        reserved_by: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        notes: document.getElementById('notes').value,
        tags: []
      };
      
      // Add to local state
      state.offcuts.unshift(offcut);
      
      // Create transaction
      const tx = {
        id: `TX-LOCAL-${Date.now()}`,
        ts: now.toISOString(),
        type: 'IN',
        offcut_id: id,
        project_id: null,
        payload: { location: offcut.location },
        user: 'ops',
        note: 'Created via UI'
      };
      
      state.txBuffer.push(tx);
      localStorage.setItem('wh.tx.buffer', JSON.stringify(state.txBuffer));
      
      window.warehouse.renderInventory();
      window.warehouse.closeModal();
    });
  };

  window.warehouse.reserveOffcut = function() {
    const form = `
      <div class="modal-content">
        <h3 data-i18n="wh.reserve">Reservar Remanente</h3>
        <form id="reserve-form">
          <input type="text" id="offcut-id" placeholder="ID/QR del remanente" required>
          <input type="text" id="project-id" placeholder="ID del proyecto" required>
          <button type="submit" class="btn btn-primary">Reservar</button>
          <button type="button" onclick="warehouse.closeModal()">Cancelar</button>
        </form>
      </div>
    `;
    
    window.warehouse.showModal(form);
    
    document.getElementById('reserve-form').addEventListener('submit', (e) => {
      e.preventDefault();
      
      const offcutId = document.getElementById('offcut-id').value;
      const projectId = document.getElementById('project-id').value;
      
      const offcut = state.offcuts.find(o => o.id === offcutId);
      if (!offcut) {
        alert('Remanente no encontrado');
        return;
      }
      
      if (offcut.status !== 'available') {
        alert('Remanente no disponible');
        return;
      }
      
      // Update local state
      offcut.status = 'reserved';
      offcut.reserved_by = projectId;
      offcut.updated_at = new Date().toISOString();
      
      // Create transaction
      const tx = {
        id: `TX-LOCAL-${Date.now()}`,
        ts: new Date().toISOString(),
        type: 'RESERVE',
        offcut_id: offcutId,
        project_id: projectId,
        payload: {},
        user: 'ops',
        note: 'Reserved via UI'
      };
      
      state.txBuffer.push(tx);
      localStorage.setItem('wh.tx.buffer', JSON.stringify(state.txBuffer));
      
      window.warehouse.renderInventory();
      window.warehouse.closeModal();
    });
  };

  window.warehouse.consumeOffcut = function() {
    const form = `
      <div class="modal-content">
        <h3 data-i18n="wh.consume">Consumir Remanente</h3>
        <form id="consume-form">
          <input type="text" id="offcut-id" placeholder="ID/QR del remanente" required>
          <input type="text" id="project-id" placeholder="ID del proyecto">
          <label>
            <input type="checkbox" id="split-offcut"> 
            <span data-i18n="wh.split">Consumo parcial (SPLIT)</span>
          </label>
          <div id="split-fields" style="display:none">
            <input type="number" id="consumed-width" placeholder="Ancho consumido (mm)">
            <input type="number" id="consumed-height" placeholder="Alto consumido (mm)">
          </div>
          <button type="submit" class="btn btn-primary">Consumir</button>
          <button type="button" onclick="warehouse.closeModal()">Cancelar</button>
        </form>
      </div>
    `;
    
    window.warehouse.showModal(form);
    
    document.getElementById('split-offcut').addEventListener('change', (e) => {
      document.getElementById('split-fields').style.display = e.target.checked ? 'block' : 'none';
    });
    
    document.getElementById('consume-form').addEventListener('submit', (e) => {
      e.preventDefault();
      
      const offcutId = document.getElementById('offcut-id').value;
      const projectId = document.getElementById('project-id').value || null;
      const isSplit = document.getElementById('split-offcut').checked;
      
      const offcut = state.offcuts.find(o => o.id === offcutId);
      if (!offcut) {
        alert('Remanente no encontrado');
        return;
      }
      
      if (offcut.status === 'consumed') {
        alert('Remanente ya consumido');
        return;
      }
      
      const now = new Date();
      
      if (isSplit) {
        const consumedW = parseInt(document.getElementById('consumed-width').value);
        const consumedH = parseInt(document.getElementById('consumed-height').value);
        
        if (consumedW > offcut.w_mm || consumedH > offcut.h_mm) {
          alert('Dimensiones consumidas exceden el tamaño del remanente');
          return;
        }
        
        // Create new offcut with remaining dimensions
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const nextId = state.offcuts.filter(o => o.id.startsWith(`OC-${dateStr}`)).length + 1;
        const newId = `OC-${dateStr}-${String(nextId).padStart(4, '0')}`;
        
        const newOffcut = {
          ...offcut,
          id: newId,
          w_mm: offcut.w_mm - consumedW,
          h_mm: offcut.h_mm,
          area_m2: ((offcut.w_mm - consumedW) * offcut.h_mm) / 1000000,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          notes: `Split from ${offcutId}`
        };
        
        state.offcuts.unshift(newOffcut);
        
        // Create split transaction
        const splitTx = {
          id: `TX-LOCAL-${Date.now()}`,
          ts: now.toISOString(),
          type: 'SPLIT',
          offcut_id: offcutId,
          project_id: projectId,
          payload: {
            new_offcut_id: newId,
            consumed: { w_mm: consumedW, h_mm: consumedH }
          },
          user: 'ops',
          note: 'Split consumption'
        };
        
        state.txBuffer.push(splitTx);
      }
      
      // Update original offcut
      offcut.status = 'consumed';
      offcut.updated_at = now.toISOString();
      
      // Create consume transaction
      const tx = {
        id: `TX-LOCAL-${Date.now() + 1}`,
        ts: now.toISOString(),
        type: 'CONSUME',
        offcut_id: offcutId,
        project_id: projectId,
        payload: {},
        user: 'ops',
        note: isSplit ? 'Partial consumption' : 'Full consumption'
      };
      
      state.txBuffer.push(tx);
      localStorage.setItem('wh.tx.buffer', JSON.stringify(state.txBuffer));
      
      window.warehouse.renderInventory();
      window.warehouse.closeModal();
    });
  };

  window.warehouse.moveOffcut = function() {
    const form = `
      <div class="modal-content">
        <h3 data-i18n="wh.move">Mover Remanente</h3>
        <form id="move-form">
          <input type="text" id="offcut-id" placeholder="ID/QR del remanente" required>
          <select id="new-location">${
            state.locations.map(loc => 
              `<option value="${loc.id}">${loc.name}</option>`
            ).join('')
          }</select>
          <button type="submit" class="btn btn-primary">Mover</button>
          <button type="button" onclick="warehouse.closeModal()">Cancelar</button>
        </form>
      </div>
    `;
    
    window.warehouse.showModal(form);
    
    document.getElementById('move-form').addEventListener('submit', (e) => {
      e.preventDefault();
      
      const offcutId = document.getElementById('offcut-id').value;
      const newLocation = document.getElementById('new-location').value;
      
      const offcut = state.offcuts.find(o => o.id === offcutId);
      if (!offcut) {
        alert('Remanente no encontrado');
        return;
      }
      
      // Update local state
      offcut.location = newLocation;
      offcut.updated_at = new Date().toISOString();
      
      // Create transaction
      const tx = {
        id: `TX-LOCAL-${Date.now()}`,
        ts: new Date().toISOString(),
        type: 'MOVE',
        offcut_id: offcutId,
        project_id: null,
        payload: { location: newLocation },
        user: 'ops',
        note: 'Moved via UI'
      };
      
      state.txBuffer.push(tx);
      localStorage.setItem('wh.tx.buffer', JSON.stringify(state.txBuffer));
      
      window.warehouse.renderInventory();
      window.warehouse.closeModal();
    });
  };

  // Print labels
  window.warehouse.printLabels = function() {
    if (state.selectedOffcuts.size === 0) {
      alert('Seleccione al menos un remanente');
      return;
    }
    
    const selected = Array.from(state.selectedOffcuts).map(id => 
      state.offcuts.find(o => o.id === id)
    ).filter(Boolean);
    
    // Store selected for labels view
    sessionStorage.setItem('wh.labels', JSON.stringify(selected));
    
    // Navigate to labels view
    location.hash = '#/warehouse/labels';
  };

  // Export functions
  window.warehouse.exportCSV = function() {
    const filtered = window.warehouse.getFilteredOffcuts();
    
    const csv = [
      ['ID', 'Material', 'Espesor', 'Ancho', 'Alto', 'Area', 'Ubicación', 'Estado', 'Proyecto', 'Actualizado'],
      ...filtered.map(o => [
        o.id,
        o.material_name,
        o.thickness_mm,
        o.w_mm,
        o.h_mm,
        o.area_m2,
        o.location,
        o.status,
        o.origin?.project_id || '',
        o.updated_at
      ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-inventory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  window.warehouse.exportPatch = function() {
    if (state.txBuffer.length === 0) {
      alert('No hay transacciones locales para exportar');
      return;
    }
    
    const blob = new Blob([JSON.stringify(state.txBuffer, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-patch-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  // Helper functions
  window.warehouse.getFilteredOffcuts = function() {
    let filtered = [...state.offcuts];
    
    if (state.filters.material) {
      filtered = filtered.filter(o => 
        o.material_name.toLowerCase().includes(state.filters.material.toLowerCase())
      );
    }
    
    if (state.filters.thickness) {
      filtered = filtered.filter(o => 
        o.thickness_mm === parseInt(state.filters.thickness)
      );
    }
    
    if (state.filters.status !== 'all') {
      filtered = filtered.filter(o => o.status === state.filters.status);
    }
    
    if (state.filters.location) {
      filtered = filtered.filter(o => 
        o.location.toLowerCase().includes(state.filters.location.toLowerCase())
      );
    }
    
    if (state.filters.search) {
      const search = state.filters.search.toLowerCase();
      filtered = filtered.filter(o => 
        o.id.toLowerCase().includes(search) ||
        o.material_code.toLowerCase().includes(search)
      );
    }
    
    return filtered;
  };

  window.warehouse.showModal = function(content) {
    const modal = document.getElementById('warehouse-modal');
    if (modal) {
      modal.innerHTML = content;
      modal.style.display = 'block';
    }
  };

  window.warehouse.closeModal = function() {
    const modal = document.getElementById('warehouse-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  // Initialize filters
  window.warehouse.initFilters = function() {
    document.getElementById('filter-material')?.addEventListener('input', (e) => {
      state.filters.material = e.target.value;
      window.warehouse.renderInventory();
    });
    
    document.getElementById('filter-thickness')?.addEventListener('input', (e) => {
      state.filters.thickness = e.target.value;
      window.warehouse.renderInventory();
    });
    
    document.getElementById('filter-status')?.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      window.warehouse.renderInventory();
    });
    
    document.getElementById('filter-location')?.addEventListener('input', (e) => {
      state.filters.location = e.target.value;
      window.warehouse.renderInventory();
    });
    
    document.getElementById('filter-search')?.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      window.warehouse.renderInventory();
    });
  };

})();