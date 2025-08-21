// Ops Dashboard - Client-side JS
(function() {
  'use strict';

  // Number formatting utilities
  const fmt = {
    mxn: v => v !== null && v !== undefined ? 
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(v) : '—',
    pct: v => v !== null && v !== undefined ? `${(v * 100).toFixed(1)}%` : '—',
    days: v => v !== null && v !== undefined ? `${v.toFixed(1)} días` : '—',
    num: v => v !== null && v !== undefined ? v.toLocaleString('es-MX') : '—'
  };

  const state = {
    projects: [],
    history: [],
    currentFilter: localStorage.getItem('ops.filter') || 'all',
    currentSort: { field: 'projectId', direction: 'asc' },
    selectedProject: null
  };

  // Load data from API endpoints
  async function loadData() {
    try {
      // Load projects summary
      const projectsResponse = await fetch('/api/ops/index.json');
      state.projects = await projectsResponse.json();

      // Load history for trends
      const historyResponse = await fetch('/api/ops/history.json');
      state.history = await historyResponse.json();

      // Populate project filter dropdown
      const projectFilter = document.getElementById('project-filter');
      projectFilter.innerHTML = '<option value="all">Todos los proyectos</option>';
      
      const uniqueProjects = [...new Set(state.projects.map(p => p.projectId))];
      uniqueProjects.sort().forEach(projectId => {
        const option = document.createElement('option');
        option.value = projectId;
        option.textContent = projectId;
        projectFilter.appendChild(option);
      });

      updateKPIs();
      renderTable();
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  // Update KPI cards with aggregated metrics
  function updateKPIs() {
    const filtered = getFilteredProjects();
    
    // Cost P50 - median
    const costP50Values = filtered.map(p => p.cost_p50).filter(v => v !== null);
    document.getElementById('kpi-cost-p50').textContent = 
      costP50Values.length > 0 ? fmt.mxn(median(costP50Values)) : '—';

    // Cost P80 - 80th percentile
    const costP80Values = filtered.map(p => p.cost_p80).filter(v => v !== null);
    document.getElementById('kpi-cost-p80').textContent = 
      costP80Values.length > 0 ? fmt.mxn(percentile(costP80Values, 80)) : '—';

    // Timeline P50 - median days
    const timelineValues = filtered.map(p => p.timeline_days_p50).filter(v => v !== null);
    document.getElementById('kpi-timeline-p50').textContent = 
      timelineValues.length > 0 ? fmt.days(median(timelineValues)) : '—';

    // Waste percentage - average
    const wasteValues = filtered.map(p => p.waste_pct).filter(v => v !== null);
    document.getElementById('kpi-waste').textContent = 
      wasteValues.length > 0 ? fmt.pct(average(wasteValues)) : '—';

    // Total sheets used
    const sheetsTotal = filtered.reduce((sum, p) => sum + (p.sheets_used || 0), 0);
    document.getElementById('kpi-sheets').textContent = sheetsTotal || '—';

    // QC Gate status
    const qcPass = filtered.filter(p => p.qc_overall_pass === true).length;
    const qcFail = filtered.filter(p => p.qc_overall_pass === false).length;
    const qcElement = document.getElementById('kpi-qc');
    if (qcPass + qcFail > 0) {
      qcElement.textContent = `${qcPass}/${qcPass + qcFail}`;
      qcElement.className = qcFail > 0 ? 'kpi-value blocked' : 'kpi-value ok';
    } else {
      qcElement.textContent = '—';
      qcElement.className = 'kpi-value';
    }

    // Total pieces
    const piecesTotal = filtered.reduce((sum, p) => sum + (p.pieces_count || 0), 0);
    document.getElementById('kpi-pieces').textContent = piecesTotal || '—';

    // Projects count
    document.getElementById('kpi-projects').textContent = filtered.length;
  }

  // Get filtered projects based on current filters
  function getFilteredProjects() {
    let filtered = [...state.projects];

    // Project filter
    const projectFilter = document.getElementById('project-filter').value;
    if (projectFilter !== 'all') {
      filtered = filtered.filter(p => p.projectId === projectFilter);
    }

    // Status filter
    if (state.currentFilter === 'ok') {
      filtered = filtered.filter(p => p.qc_overall_pass === true);
    } else if (state.currentFilter === 'blocked') {
      filtered = filtered.filter(p => p.qc_overall_pass === false);
    }

    return filtered;
  }

  // Render projects table
  function renderTable() {
    const filtered = getFilteredProjects();
    const sorted = sortProjects(filtered);
    
    const tbody = document.getElementById('projects-tbody');
    tbody.innerHTML = '';

    sorted.forEach(project => {
      const tr = document.createElement('tr');
      tr.onclick = () => showProjectDetail(project.projectId);
      
      // Format date
      const date = new Date(project.generated_at);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;

      // QC status badge
      let qcBadge = '<span class="badge pending">—</span>';
      if (project.qc_overall_pass === true) {
        qcBadge = '<span class="badge pass">PASS</span>';
      } else if (project.qc_overall_pass === false) {
        qcBadge = '<span class="badge fail">FAIL</span>';
      }

      tr.innerHTML = `
        <td>${project.projectId}</td>
        <td>${project.cliente || '—'}</td>
        <td>${fmt.mxn(project.cost_p50)}</td>
        <td>${fmt.mxn(project.cost_p80)}</td>
        <td>${project.timeline_days_p50 ? `${project.timeline_days_p50}d` : '—'}</td>
        <td>${fmt.pct(project.waste_pct)}</td>
        <td>${project.sheets_used || '—'}</td>
        <td>${qcBadge}</td>
        <td>${project.pieces_count || '—'}</td>
        <td>${dateStr}</td>
      `;
      
      tbody.appendChild(tr);
    });
  }

  // Sort projects
  function sortProjects(projects) {
    const sorted = [...projects];
    const { field, direction } = state.currentSort;
    
    sorted.sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }

  // Show project detail view
  async function showProjectDetail(projectId) {
    location.hash = `#/${projectId}`;
    await loadProjectDetail(projectId);
  }

  // Load project detail
  async function loadProjectDetail(projectId) {
    try {
      // Load detailed project data
      const response = await fetch(`/api/ops/projects/${projectId}.json`);
      const project = await response.json();
      
      state.selectedProject = project;
      
      // Hide list, show detail
      document.getElementById('projects-section').classList.add('hidden');
      document.getElementById('kpi-cards').classList.add('hidden');
      document.getElementById('project-detail').classList.remove('hidden');
      
      // Update title
      document.getElementById('detail-title').textContent = `${projectId} - ${project.cliente || 'Cliente'}`;
      
      // QC Phases
      const qcPhasesDiv = document.getElementById('qc-phases');
      qcPhasesDiv.innerHTML = '';
      
      ['pre_cnc', 'pre_instalacion', 'entrega'].forEach(phase => {
        const phaseData = project.phase_status[phase];
        if (phaseData.pass !== null) {
          const badge = document.createElement('div');
          badge.className = `phase-badge ${phaseData.pass ? 'pass' : 'fail'}`;
          badge.innerHTML = `
            <span>${phase.replace('_', ' ').toUpperCase()}</span>
            ${phaseData.pass ? '✅' : `❌ (${phaseData.high_fails} high)`}
          `;
          qcPhasesDiv.appendChild(badge);
        }
      });
      
      // Panels info
      const panelsDiv = document.getElementById('panels-info');
      panelsDiv.innerHTML = '';
      
      if (project.panels_materials && Object.keys(project.panels_materials).length > 0) {
        for (const [material, count] of Object.entries(project.panels_materials)) {
          const row = document.createElement('div');
          row.className = 'info-row';
          row.innerHTML = `
            <span class="info-label">${material}</span>
            <span class="info-value">${count} sheets</span>
          `;
          panelsDiv.appendChild(row);
        }
      }
      
      if (project.waste_pct !== null) {
        const row = document.createElement('div');
        row.className = 'info-row';
        row.innerHTML = `
          <span class="info-label">Merma real</span>
          <span class="info-value">${(project.waste_pct * 100).toFixed(1)}%</span>
        `;
        panelsDiv.appendChild(row);
      }
      
      // Hardware info
      const hardwareDiv = document.getElementById('hardware-info');
      hardwareDiv.innerHTML = '';
      
      if (project.hardware.guias) {
        const row = document.createElement('div');
        row.className = 'info-row';
        row.innerHTML = `
          <span class="info-label">Guías</span>
          <span class="info-value">${project.hardware.guias}</span>
        `;
        hardwareDiv.appendChild(row);
      }
      
      if (project.hardware.bisagras) {
        const row = document.createElement('div');
        row.className = 'info-row';
        row.innerHTML = `
          <span class="info-label">Bisagras</span>
          <span class="info-value">${project.hardware.bisagras}</span>
        `;
        hardwareDiv.appendChild(row);
      }
      
      // Trends - Cost
      const costHistory = state.history
        .filter(h => h.projectId === projectId && h.cost_p50 !== null)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-30);
      
      if (costHistory.length > 1) {
        const costValues = costHistory.map(h => h.cost_p50);
        document.getElementById('trend-cost').innerHTML = createSparkline(costValues, '#28a745');
      } else {
        document.getElementById('trend-cost').innerHTML = '<span style="color:#999">Sin datos históricos</span>';
      }
      
      // Trends - Waste
      const wasteHistory = state.history
        .filter(h => h.projectId === projectId && h.waste_pct !== null)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-30);
      
      if (wasteHistory.length > 1) {
        const wasteValues = wasteHistory.map(h => h.waste_pct * 100);
        document.getElementById('trend-waste').innerHTML = createSparkline(wasteValues, '#ffc107');
      } else {
        document.getElementById('trend-waste').innerHTML = '<span style="color:#999">Sin datos históricos</span>';
      }
      
    } catch (error) {
      console.error('Error loading project detail:', error);
      alert('Error loading project detail');
    }
  }

  // Create sparkline SVG
  function createSparkline(values, color = '#111') {
    if (values.length < 2) return '';
    
    const width = 200;
    const height = 40;
    const padding = 2;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    const xScale = (width - 2 * padding) / (values.length - 1);
    const yScale = (height - 2 * padding) / range;
    
    const points = values.map((v, i) => {
      const x = padding + i * xScale;
      const y = height - padding - ((v - min) * yScale);
      return `${x},${y}`;
    }).join(' ');
    
    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <polyline 
          points="${points}" 
          fill="none" 
          stroke="${color}" 
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    `;
  }

  // Export to CSV
  function exportCSV() {
    const filtered = getFilteredProjects();
    
    // CSV headers
    const headers = [
      'Project ID',
      'Cliente',
      'Cost P50',
      'Cost P80',
      'Timeline Days',
      'Waste %',
      'Sheets Used',
      'QC Status',
      'Pieces Count',
      'Last Updated'
    ];
    
    // Build CSV content
    const rows = [headers];
    
    filtered.forEach(project => {
      const row = [
        project.projectId,
        project.cliente || '',
        project.cost_p50 || '',
        project.cost_p80 || '',
        project.timeline_days_p50 || '',
        project.waste_pct !== null ? (project.waste_pct * 100).toFixed(2) : '',
        project.sheets_used || '',
        project.qc_overall_pass === true ? 'OK' : project.qc_overall_pass === false ? 'BLOCKED' : '',
        project.pieces_count || '',
        project.generated_at || ''
      ];
      rows.push(row);
    });
    
    // Convert to CSV string
    const csvContent = rows.map(row => 
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma
        const value = String(cell);
        if (value.includes(',') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    ).join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    link.href = url;
    link.download = `ops-export-${dateStr}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  // Statistical helpers
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  function average(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  // Event handlers
  function setupEventHandlers() {
    // Status filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.currentFilter = e.target.dataset.status;
        localStorage.setItem('ops.filter', state.currentFilter);
        updateKPIs();
        renderTable();
      });
    });

    // Set active filter button on load
    document.querySelectorAll('.filter-btn').forEach(btn => {
      if (btn.dataset.status === state.currentFilter) {
        btn.classList.add('active');
      }
    });

    // Project filter dropdown
    document.getElementById('project-filter').addEventListener('change', () => {
      updateKPIs();
      renderTable();
    });

    // Export button
    document.getElementById('export-csv').addEventListener('click', exportCSV);

    // Table sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', (e) => {
        const field = e.target.dataset.sort;
        
        // Update sort direction
        if (state.currentSort.field === field) {
          state.currentSort.direction = state.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          state.currentSort.field = field;
          state.currentSort.direction = 'asc';
        }
        
        // Update UI
        document.querySelectorAll('th[data-sort]').forEach(t => {
          t.classList.remove('sort-asc', 'sort-desc');
        });
        e.target.classList.add(state.currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        
        renderTable();
      });
    });
  }

  // Show projects list (from detail view)
  window.showProjectsList = function() {
    location.hash = '';
    document.getElementById('project-detail').classList.add('hidden');
    document.getElementById('projects-section').classList.remove('hidden');
    document.getElementById('kpi-cards').classList.remove('hidden');
    state.selectedProject = null;
  };

  // Router for hash-based navigation
  async function router() {
    const hash = location.hash.slice(1);
    if (hash.startsWith('/')) {
      const projectId = hash.slice(1);
      if (projectId && state.projects.find(p => p.projectId === projectId)) {
        await loadProjectDetail(projectId);
      }
    } else {
      showProjectsList();
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    setupEventHandlers();
    await loadData();
    await router();
  });

  // Handle hash changes
  window.addEventListener('hashchange', router);

})();