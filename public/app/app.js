// Single Page Application for QC Field App
const app = {
  currentProject: null,
  currentPhase: null,
  checklists: null,
  formData: {},
  evidence: {},
  signature: null,
  installPrompt: null
};

// Router
function router() {
  const hash = window.location.hash || '#/';
  const parts = hash.split('/').filter(p => p);
  
  if (parts.length === 0 || parts[0] === '#') {
    showProjects();
  } else if (parts[0] === 'qc' && parts.length === 3) {
    const projectId = parts[1];
    const phase = parts[2];
    showQCForm(projectId, phase);
  } else {
    showProjects();
  }
}

// Show projects list
async function showProjects() {
  const main = document.getElementById('app');
  const statusBar = document.getElementById('status-bar');
  
  statusBar.textContent = 'Proyectos disponibles';
  main.innerHTML = '<div class="loading">Cargando proyectos...</div>';
  
  try {
    const response = await fetch('/api/projects.json');
    const projects = await response.json();
    
    let html = '<h2>Selecciona un proyecto</h2>';
    html += '<div class="project-list">';
    
    for (const project of projects) {
      html += `
        <div class="card">
          <div class="card-header">${project.id}</div>
          <p>${project.cliente}</p>
          <div class="phase-nav">
      `;
      
      for (const phase of project.phases) {
        const phaseName = phase.replace('_', ' ');
        html += `<a href="#/qc/${project.id}/${phase}" class="btn btn-outline">${phaseName}</a>`;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    html += '</div>';
    main.innerHTML = html;
  } catch (error) {
    main.innerHTML = '<div class="card"><p>Error cargando proyectos</p></div>';
    console.error('Error loading projects:', error);
  }
}

// Show QC form for a specific phase
async function showQCForm(projectId, phase) {
  app.currentProject = projectId;
  app.currentPhase = phase;
  
  const main = document.getElementById('app');
  const statusBar = document.getElementById('status-bar');
  
  statusBar.textContent = `Proyecto: ${projectId} · Fase: ${phase}`;
  main.innerHTML = '<div class="loading">Cargando checklist...</div>';
  
  try {
    // Load checklist
    const response = await fetch(`/api/${projectId}/checklists.json`);
    app.checklists = await response.json();
    
    // Load saved data from localStorage
    const savedKey = `qc:${projectId}:${phase}`;
    const saved = localStorage.getItem(savedKey);
    if (saved) {
      const savedData = JSON.parse(saved);
      app.formData = savedData.answers || {};
      app.evidence = savedData.evidence || {};
      app.signature = savedData.signature_png || null;
    } else {
      app.formData = {};
      app.evidence = {};
      app.signature = null;
    }
    
    renderForm();
  } catch (error) {
    main.innerHTML = '<div class="card"><p>Error cargando checklist</p></div>';
    console.error('Error loading checklist:', error);
  }
}

// Render the QC form
function renderForm() {
  const main = document.getElementById('app');
  const phase = app.currentPhase;
  const items = app.checklists.phases[phase] || [];
  
  let html = `
    <div class="phase-nav">
      <a href="#/qc/${app.currentProject}/pre_cnc" class="${phase === 'pre_cnc' ? 'active' : ''}">Pre CNC</a>
      <a href="#/qc/${app.currentProject}/pre_instalacion" class="${phase === 'pre_instalacion' ? 'active' : ''}">Pre Instalación</a>
      <a href="#/qc/${app.currentProject}/entrega" class="${phase === 'entrega' ? 'active' : ''}">Entrega</a>
    </div>
    
    <form id="qc-form">
      <div class="card">
        <div class="card-header">Información General</div>
        
        <div class="form-group">
          <label>Responsable</label>
          <input type="text" id="responsable" placeholder="Nombre completo" value="${app.formData.responsable || ''}">
        </div>
        
        <div class="form-group">
          <label>Estación</label>
          <select id="station">
            <option value="">Selecciona...</option>
            <option value="Corte/CNC" ${app.formData.station === 'Corte/CNC' ? 'selected' : ''}>Corte/CNC</option>
            <option value="Sitio" ${app.formData.station === 'Sitio' ? 'selected' : ''}>Sitio</option>
            <option value="Instalación" ${app.formData.station === 'Instalación' ? 'selected' : ''}>Instalación</option>
          </select>
        </div>
      </div>
  `;
  
  // Render items
  let highFails = 0;
  
  for (const item of items) {
    const value = app.formData[item.id];
    let status = 'pending';
    let inputHtml = '';
    
    if (item.type === 'auto_eq') {
      // Automatic evaluation
      const pass = item.left_value === item.right_value;
      status = pass ? 'pass' : 'fail';
      if (!pass && item.severity === 'high') highFails++;
      
      inputHtml = `
        <p><strong>Automático:</strong></p>
        <p>${item.left}: ${item.left_value}</p>
        <p>${item.right}: ${item.right_value}</p>
        <p>Estado: <strong>${pass ? 'PASS' : 'FAIL'}</strong></p>
      `;
    } else if (item.type === 'number_range') {
      if (value !== undefined) {
        status = value >= item.min && value <= item.max ? 'pass' : 'fail';
        if (status === 'fail' && item.severity === 'high') highFails++;
      }
      
      inputHtml = `
        <input type="number" 
               id="input-${item.id}" 
               data-item-id="${item.id}"
               data-type="${item.type}"
               data-min="${item.min}"
               data-max="${item.max}"
               value="${value || ''}"
               min="${item.min}"
               max="${item.max}"
               step="0.1">
        <div class="hint">Rango: ${item.min} - ${item.max} ${item.units || ''}</div>
      `;
    } else if (item.type === 'number_max') {
      if (value !== undefined) {
        status = value <= item.max ? 'pass' : 'fail';
        if (status === 'fail' && item.severity === 'high') highFails++;
      }
      
      inputHtml = `
        <input type="number" 
               id="input-${item.id}"
               data-item-id="${item.id}"
               data-type="${item.type}"
               data-max="${item.max}"
               value="${value || ''}"
               max="${item.max}"
               step="0.1">
        <div class="hint">Máximo: ${item.max} ${item.units || ''}</div>
      `;
    } else if (item.type === 'bool_true') {
      if (value !== undefined) {
        status = value === true ? 'pass' : 'fail';
        if (status === 'fail' && item.severity === 'high') highFails++;
      }
      
      inputHtml = `
        <label>
          <input type="checkbox" 
                 id="input-${item.id}"
                 data-item-id="${item.id}"
                 data-type="${item.type}"
                 ${value === true ? 'checked' : ''}>
          Confirmar
        </label>
      `;
    }
    
    // Evidence upload if needed
    let evidenceHtml = '';
    if (item.evidence && item.evidence !== 'none') {
      const evidenceKey = item.id;
      const evidenceFiles = app.evidence[evidenceKey] || [];
      
      evidenceHtml = `
        <div class="form-group">
          <label>Evidencia (${item.evidence})</label>
          <input type="file" 
                 accept="image/*" 
                 multiple 
                 capture="environment"
                 data-evidence-for="${item.id}">
          <div class="evidence-preview" id="preview-${item.id}">
            ${evidenceFiles.map(img => `<img src="${img}" alt="Evidence">`).join('')}
          </div>
        </div>
      `;
    }
    
    html += `
      <div class="item ${status}">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${item.id}</strong>
          <span class="badge badge-${item.severity}">${item.severity}</span>
        </div>
        <p>${item.desc}</p>
        <div class="form-group">
          ${inputHtml}
        </div>
        ${evidenceHtml}
      </div>
    `;
  }
  
  // Update high fails counter
  const statusBar = document.getElementById('status-bar');
  statusBar.innerHTML = `Proyecto: ${app.currentProject} · Fase: ${phase} · <span style="color: ${highFails > 0 ? '#ff6b6b' : '#51cf66'}">High fails: ${highFails}</span>`;
  
  // Signature section
  html += `
    <div class="card">
      <div class="card-header">Firma Digital</div>
      <canvas id="signature-canvas" width="300" height="120"></canvas>
      <div style="display: flex; gap: 0.5rem;">
        <button type="button" class="btn btn-outline" onclick="clearSignature()">Limpiar firma</button>
      </div>
    </div>
    
    <div class="card">
      <button type="button" class="btn btn-primary btn-block" onclick="saveLocal()">💾 Guardar Local</button>
      <button type="button" class="btn btn-success btn-block" onclick="exportJSON()">📤 Exportar JSON</button>
      <button type="button" class="btn btn-secondary btn-block" onclick="importJSON()">📥 Importar JSON</button>
      <input type="file" id="import-file" accept=".json" style="display: none;">
    </div>
  `;
  
  html += '</form>';
  main.innerHTML = html;
  
  // Setup event listeners
  setupEventListeners();
  setupSignatureCanvas();
  
  // Restore signature if exists
  if (app.signature) {
    const canvas = document.getElementById('signature-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0);
    };
    img.src = app.signature;
  }
}

// Setup event listeners for form inputs
function setupEventListeners() {
  // Input change handlers
  document.querySelectorAll('input[data-item-id], select[data-item-id]').forEach(input => {
    input.addEventListener('change', (e) => {
      const itemId = e.target.dataset.itemId;
      const type = e.target.dataset.type;
      
      let value;
      if (type === 'bool_true') {
        value = e.target.checked;
      } else if (type === 'number_range' || type === 'number_max') {
        value = parseFloat(e.target.value);
      } else {
        value = e.target.value;
      }
      
      app.formData[itemId] = value;
      renderForm(); // Re-render to update status
    });
  });
  
  // General fields
  document.getElementById('responsable')?.addEventListener('change', (e) => {
    app.formData.responsable = e.target.value;
  });
  
  document.getElementById('station')?.addEventListener('change', (e) => {
    app.formData.station = e.target.value;
  });
  
  // Evidence upload handlers
  document.querySelectorAll('input[data-evidence-for]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const itemId = e.target.dataset.evidenceFor;
      const files = Array.from(e.target.files);
      
      if (!app.evidence[itemId]) {
        app.evidence[itemId] = [];
      }
      
      for (const file of files) {
        const base64 = await fileToBase64(file, 1600);
        app.evidence[itemId].push(base64);
      }
      
      renderForm(); // Re-render to show previews
    });
  });
  
  // Import file handler
  document.getElementById('import-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          app.formData = data.answers || {};
          app.evidence = data.evidence || {};
          app.signature = data.signature_png || null;
          renderForm();
          showSnackbar('Datos importados correctamente');
        } catch (error) {
          showSnackbar('Error al importar archivo');
        }
      };
      reader.readAsText(file);
    }
  });
}

// Setup signature canvas
function setupSignatureCanvas() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  // Touch events for mobile
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
  });
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
  });
  
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
  });
  
  function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
  }
  
  function draw(e) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    lastX = x;
    lastY = y;
    
    // Save signature
    app.signature = canvas.toDataURL('image/png');
  }
  
  function stopDrawing() {
    isDrawing = false;
  }
}

// Clear signature
window.clearSignature = function() {
  const canvas = document.getElementById('signature-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    app.signature = null;
  }
};

// Convert file to base64 with resize
async function fileToBase64(file, maxSize) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Save to localStorage
window.saveLocal = function() {
  const key = `qc:${app.currentProject}:${app.currentPhase}`;
  const data = {
    projectId: app.currentProject,
    phase: app.currentPhase,
    responsable: app.formData.responsable || '',
    station: app.formData.station || '',
    timestamp: new Date().toISOString(),
    answers: app.formData,
    evidence: app.evidence,
    signature_png: app.signature
  };
  
  localStorage.setItem(key, JSON.stringify(data));
  showSnackbar('Guardado localmente');
};

// Export JSON
window.exportJSON = function() {
  const data = {
    projectId: app.currentProject,
    phase: app.currentPhase,
    responsable: app.formData.responsable || '',
    station: app.formData.station || '',
    timestamp: new Date().toISOString(),
    answers: {}
  };
  
  // Only include actual answers (not metadata fields)
  const items = app.checklists.phases[app.currentPhase] || [];
  for (const item of items) {
    if (item.type !== 'auto_eq' && app.formData[item.id] !== undefined) {
      data.answers[item.id] = app.formData[item.id];
    }
  }
  
  // Add evidence if exists
  if (Object.keys(app.evidence).length > 0) {
    data.evidence = app.evidence;
  }
  
  // Add signature if exists
  if (app.signature) {
    data.signature_png = app.signature;
  }
  
  // Create download with standardized naming
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, -1);
  const filename = `${app.currentProject}-${app.currentPhase}-qc-${timestamp}.json`;
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  
  const answerCount = Object.keys(data.answers).length;
  const evidenceCount = Object.keys(app.evidence).reduce((sum, key) => sum + app.evidence[key].length, 0);
  console.log(`📤 QC export: saved ${filename} (answers: ${answerCount}, evidence imgs: ${evidenceCount})`);
  showSnackbar(`Exportado: ${filename}`);
};

// Import JSON
window.importJSON = function() {
  document.getElementById('import-file').click();
};

// Show snackbar notification
function showSnackbar(message) {
  const snackbar = document.getElementById('snackbar');
  snackbar.textContent = message;
  snackbar.className = 'show';
  setTimeout(() => {
    snackbar.className = '';
  }, 3000);
}

// PWA Install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  // Show install button if needed
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.classList.remove('hidden');
  }
});

window.installPWA = async function() {
  if (!app.installPrompt) return;
  
  app.installPrompt.prompt();
  const { outcome } = await app.installPrompt.userChoice;
  
  if (outcome === 'accepted') {
    showSnackbar('App instalada exitosamente');
  }
  
  app.installPrompt = null;
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.classList.add('hidden');
  }
};

// Warehouse scan functionality
window.scanOffcut = async function() {
  // Check for BarcodeDetector API
  if ('BarcodeDetector' in window) {
    try {
      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      // Create video element
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      
      // Create barcode detector
      const barcodeDetector = new BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39']
      });
      
      // Scan for barcode
      const detectBarcode = async () => {
        try {
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            
            // Stop camera
            stream.getTracks().forEach(track => track.stop());
            
            // Process scan
            processScan(code);
          } else {
            // Keep scanning
            requestAnimationFrame(detectBarcode);
          }
        } catch (err) {
          console.error('Barcode detection error:', err);
        }
      };
      
      detectBarcode();
      
    } catch (err) {
      console.error('Camera access error:', err);
      // Fallback to manual input
      showManualInput();
    }
  } else {
    // BarcodeDetector not available, use manual input
    showManualInput();
  }
};

function showManualInput() {
  const code = prompt('Ingrese el código del remanente (ej: OC-20250821-0001):');
  if (code) {
    processScan(code);
  }
}

function processScan(code) {
  // Parse code (format: O:<offcut_id> or just offcut_id)
  const offcutId = code.startsWith('O:') ? code.slice(2) : code;
  
  // Create transaction
  const tx = {
    id: `TX-APP-${Date.now()}`,
    ts: new Date().toISOString(),
    type: 'SCAN',
    offcut_id: offcutId,
    project_id: app.currentProject || null,
    payload: {
      location: 'field',
      scanner: 'app'
    },
    user: app.formData.responsable || 'field',
    note: 'Scanned via Field App'
  };
  
  // Add to local buffer
  let buffer = JSON.parse(localStorage.getItem('wh.tx.buffer') || '[]');
  buffer.push(tx);
  localStorage.setItem('wh.tx.buffer', JSON.stringify(buffer));
  
  // Show result
  showSnackbar(`Remanente ${offcutId} escaneado`);
}

// Add scan route handler
const originalRouter = router;
router = async function() {
  if (location.hash === '#/scan-offcut') {
    const content = `
      <div class="scan-container">
        <h2>Escanear Remanente</h2>
        <button onclick="scanOffcut()" class="btn btn-primary">
          📷 Escanear QR/Código
        </button>
        <div id="scan-result"></div>
        <div class="scan-buffer">
          <h3>Buffer Local</h3>
          <div id="buffer-count">0 transacciones</div>
          <button onclick="clearScanBuffer()" class="btn">Limpiar Buffer</button>
        </div>
      </div>
    `;
    
    document.getElementById('content').innerHTML = content;
    
    // Update buffer count
    const buffer = JSON.parse(localStorage.getItem('wh.tx.buffer') || '[]');
    document.getElementById('buffer-count').textContent = `${buffer.length} transacciones`;
  } else {
    // Original router logic
    await originalRouter();
  }
};

window.clearScanBuffer = function() {
  if (confirm('¿Limpiar el buffer de transacciones?')) {
    localStorage.removeItem('wh.tx.buffer');
    document.getElementById('buffer-count').textContent = '0 transacciones';
    showSnackbar('Buffer limpiado');
  }
};

// Initialize app
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);