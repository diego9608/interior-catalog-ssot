// Labels printing module for warehouse
(function() {
  'use strict';

  window.warehouseLabels = window.warehouseLabels || {};
  
  // Generate QR code as SVG
  window.warehouseLabels.generateQR = function(text) {
    // Simple QR placeholder - in production would use proper QR library
    // For now, create a data matrix pattern
    const size = 64;
    const modules = 21; // QR version 1
    const moduleSize = size / modules;
    
    let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="' + size + '" height="' + size + '" fill="white"/>';
    
    // Generate pseudo-random pattern based on text
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rng = (seed) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        // Finder patterns in corners
        const isFinderTL = (row < 7 && col < 7);
        const isFinderTR = (row < 7 && col >= modules - 7);
        const isFinderBL = (row >= modules - 7 && col < 7);
        
        let isDark = false;
        
        if (isFinderTL || isFinderTR || isFinderBL) {
          // Finder pattern
          const localRow = isFinderBL ? row - (modules - 7) : row;
          const localCol = isFinderTR ? col - (modules - 7) : col;
          isDark = (localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6) ||
                   (localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4);
        } else {
          // Data area - pseudo random based on text
          isDark = rng(hash + row * modules + col) > 0.5;
        }
        
        if (isDark) {
          svg += `<rect x="${col * moduleSize}" y="${row * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
        }
      }
    }
    
    svg += '</svg>';
    return svg;
  };

  // Render labels view
  window.warehouseLabels.render = function() {
    const labelsData = sessionStorage.getItem('wh.labels');
    if (!labelsData) {
      alert('No hay etiquetas para imprimir');
      location.hash = '#/warehouse';
      return;
    }
    
    const offcuts = JSON.parse(labelsData);
    const container = document.getElementById('labels-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Create labels grid
    const grid = document.createElement('div');
    grid.className = 'labels-grid';
    
    offcuts.forEach(offcut => {
      const label = document.createElement('div');
      label.className = 'label';
      
      const qrCode = window.warehouseLabels.generateQR(`O:${offcut.id}`);
      
      label.innerHTML = `
        <div class="label-qr">${qrCode}</div>
        <div class="label-info">
          <div class="label-id">${offcut.id}</div>
          <div class="label-material">${offcut.material_name}</div>
          <div class="label-specs">
            <span>${offcut.thickness_mm}mm</span>
            <span>${offcut.w_mm}×${offcut.h_mm}mm</span>
          </div>
          <div class="label-area">${offcut.area_m2.toFixed(3)} m²</div>
          <div class="label-location">${offcut.location}</div>
          <div class="label-date">${new Date(offcut.created_at).toLocaleDateString()}</div>
        </div>
      `;
      
      grid.appendChild(label);
    });
    
    container.appendChild(grid);
    
    // Add print button
    const printBtn = document.createElement('button');
    printBtn.className = 'btn btn-primary no-print';
    printBtn.textContent = 'Imprimir';
    printBtn.onclick = () => window.print();
    container.appendChild(printBtn);
    
    // Add back button
    const backBtn = document.createElement('button');
    backBtn.className = 'btn no-print';
    backBtn.textContent = 'Volver';
    backBtn.onclick = () => location.hash = '#/warehouse';
    container.appendChild(backBtn);
  };

})();