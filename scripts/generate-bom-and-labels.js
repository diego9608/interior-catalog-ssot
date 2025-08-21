const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

// Load label configuration
function loadLabelConfig() {
  const configPath = path.join(__dirname, '..', 'data', 'catalog', 'labels', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`${colors.red}E-BOM-002: Missing labels config${colors.reset}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Load hardware catalog for assumptions
function loadHardwareCatalog() {
  const hardwarePath = path.join(__dirname, '..', 'data', 'catalog', 'pricing', 'hardware.json');
  if (!fs.existsSync(hardwarePath)) {
    return { assumptions: { bisagras_por_puerta: 2 } };
  }
  return JSON.parse(fs.readFileSync(hardwarePath, 'utf8'));
}

// Parse CSV file
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }
  
  return data;
}

// Generate BOM for a project
function generateBOM(projectId) {
  const projectDir = path.join(__dirname, '..', 'data', 'projects', projectId);
  const intakePath = path.join(projectDir, 'intake.json');
  const piecesPath = path.join(projectDir, 'pieces.csv');
  const cutlistPath = path.join(projectDir, 'cutlist.csv');
  const cutsReportPath = path.join(__dirname, '..', 'reports', `cuts-${projectId}.json`);
  
  // Check required files
  if (!fs.existsSync(intakePath)) {
    console.error(`${colors.red}E-BOM-001: Missing intake.json for ${projectId}${colors.reset}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(cutsReportPath)) {
    console.error(`${colors.red}E-BOM-001: Missing cuts report for ${projectId}${colors.reset}`);
    process.exit(1);
  }
  
  // Load data
  const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
  const cutsReport = JSON.parse(fs.readFileSync(cutsReportPath, 'utf8'));
  const pieces = parseCSV(piecesPath);
  const cutlist = parseCSV(cutlistPath);
  const hardware = loadHardwareCatalog();
  
  // Initialize BOM structure
  const bom = {
    projectId,
    generated_at: new Date().toISOString(),
    materials: {
      panels: {},
      countertops: {}
    },
    hardware: {},
    adhesives: [],
    sheets: [],
    pieces: []
  };
  
  // Process panels from cuts report
  if (cutsReport.material_sheets) {
    for (const [materialId, materialData] of Object.entries(cutsReport.material_sheets)) {
      bom.materials.panels[materialId] = {
        sheet_mm: materialData.sheet_mm || [1220, 2440],
        sheets_used: materialData.sheets_used,
        sheet_area_m2: materialData.sheet_area_m2,
        total_sheet_area_m2: materialData.sheet_area_m2 * materialData.sheets_used,
        pieces_area_m2: materialData.pieces_area_m2,
        waste_area_m2: materialData.waste_area_m2,
        waste_pct: materialData.waste_pct
      };
      
      // Track sheets
      for (let i = 1; i <= materialData.sheets_used; i++) {
        const placementsOnSheet = materialData.placements.filter(p => p.sheet === i);
        bom.sheets.push({
          material_id: materialId,
          sheet_index: i,
          placements_count: placementsOnSheet.length
        });
      }
    }
  }
  
  // Process countertops from intake
  if (intake.especificaciones?.encimera && intake.scope?.cubierta_m2) {
    bom.materials.countertops[intake.especificaciones.encimera] = {
      area_m2: intake.scope.cubierta_m2
    };
  }
  
  // Process hardware from intake
  if (intake.especificaciones?.herrajes_estandar && intake.scope) {
    const herrajes = intake.especificaciones.herrajes_estandar;
    const scope = intake.scope;
    
    // Find guias and bisagras
    const guia = herrajes.find(h => h.includes('guia'));
    const bisagra = herrajes.find(h => h.includes('bisagra'));
    
    if (guia && scope.cajones_unidades) {
      bom.hardware[guia] = { count: scope.cajones_unidades };
    }
    
    if (bisagra && scope.puertas_unidades) {
      const bisagras_por_puerta = hardware.assumptions?.bisagras_por_puerta || 2;
      bom.hardware[bisagra] = {
        count: scope.puertas_unidades * bisagras_por_puerta,
        bisagras_por_puerta
      };
    }
  }
  
  // Process adhesives from intake
  if (intake.especificaciones?.adhesivo_zona_humeda) {
    bom.adhesives.push({
      id: intake.especificaciones.adhesivo_zona_humeda,
      estacion: 'zona_humeda'
    });
  }
  if (intake.especificaciones?.adhesivo_interior) {
    bom.adhesives.push({
      id: intake.especificaciones.adhesivo_interior,
      estacion: 'interior'
    });
  }
  
  // Process pieces - combine data from pieces.csv, cutlist.csv, and cuts report
  const pieceCounters = {};
  
  // Build lookup maps
  const piecesMap = {};
  pieces.forEach(p => {
    if (!piecesMap[p.piece_id]) {
      piecesMap[p.piece_id] = p;
    }
  });
  
  // Process each placement from cuts report
  if (cutsReport.material_sheets) {
    for (const [materialId, materialData] of Object.entries(cutsReport.material_sheets)) {
      if (materialData.placements) {
        materialData.placements.forEach(placement => {
          const pieceId = placement.piece_id;
          
          // Generate unique piece UID
          if (!pieceCounters[pieceId]) {
            pieceCounters[pieceId] = 0;
          }
          pieceCounters[pieceId]++;
          const pieceUid = `${pieceId}#${String(pieceCounters[pieceId]).padStart(2, '0')}`;
          
          // Get piece info from pieces.csv
          const pieceInfo = piecesMap[pieceId] || {};
          
          // Parse banding
          let banding = [];
          if (placement.banding) {
            if (placement.banding === '-') {
              banding = [];
            } else {
              banding = placement.banding.split('').filter(b => b !== ',');
            }
          } else if (pieceInfo.banding) {
            const bandingStr = pieceInfo.banding.replace(/,/g, '');
            if (bandingStr !== '-') {
              banding = bandingStr.split('');
            }
          }
          
          bom.pieces.push({
            piece_uid: pieceUid,
            piece_id: pieceId,
            material_id: materialId,
            w_mm: placement.w,
            h_mm: placement.h,
            sheet_index: placement.sheet,
            x_mm: placement.x,
            y_mm: placement.y,
            rotated: placement.rotated || false,
            banding,
            notes: pieceInfo.notes || ''
          });
        });
      }
    }
  }
  
  return bom;
}

// Generate SVG label for a piece
async function generatePieceLabel(piece, projectId, labelConfig, qrPayload) {
  const [width, height] = labelConfig.label_size_mm;
  const margin = labelConfig.margin_mm;
  const qrSize = labelConfig.qr_size_mm;
  const fontSize = labelConfig.font_size_pt;
  
  // Convert mm to pixels (assuming 96 DPI for SVG)
  const mmToPx = (mm) => mm * 3.7795;
  
  const svgWidth = mmToPx(width);
  const svgHeight = mmToPx(height);
  const svgMargin = mmToPx(margin);
  const svgQrSize = mmToPx(qrSize);
  
  // Prepare QR payload
  let qrData;
  if (labelConfig.qr_payload === 'url' && labelConfig.base_url) {
    qrData = `${labelConfig.base_url}/p/${projectId}/piece/${piece.piece_uid}?s=${piece.sheet_index}&x=${piece.x_mm}&y=${piece.y_mm}`;
  } else {
    // JSON payload
    qrData = JSON.stringify({
      p: projectId,
      u: piece.piece_uid,
      m: piece.material_id,
      s: piece.sheet_index,
      x: piece.x_mm,
      y: piece.y_mm
    });
  }
  
  // Generate QR code as SVG string
  const qrSvg = await QRCode.toString(qrData, {
    type: 'svg',
    width: svgQrSize,
    margin: 0
  });
  
  // Extract just the QR path from the generated SVG
  const qrMatch = qrSvg.match(/<path[^>]*d="([^"]+)"/);
  const qrPath = qrMatch ? qrMatch[1] : '';
  
  // Prepare banding display
  let bandingText = '';
  if (labelConfig.include_banding_map && piece.banding && piece.banding.length > 0) {
    bandingText = piece.banding.join('/');
  }
  
  // Create SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <!-- Border -->
  <rect x="1" y="1" width="${svgWidth - 2}" height="${svgHeight - 2}" fill="none" stroke="black" stroke-width="1"/>
  
  <!-- QR Code -->
  <g transform="translate(${svgWidth - svgQrSize - svgMargin}, ${svgMargin})">
    <rect x="0" y="0" width="${svgQrSize}" height="${svgQrSize}" fill="white"/>
    <path d="${qrPath}" fill="black" transform="scale(${svgQrSize / 256})"/>
  </g>
  
  <!-- Text content -->
  <text x="${svgMargin}" y="${svgMargin + 12}" font-family="Arial, sans-serif" font-size="${fontSize}pt" fill="black">
    <tspan x="${svgMargin}" dy="0">Proyecto: ${projectId}</tspan>
    <tspan x="${svgMargin}" dy="14">Pieza: ${piece.piece_uid}</tspan>
    <tspan x="${svgMargin}" dy="14">Material: ${piece.material_id.split('.').pop()}</tspan>
    <tspan x="${svgMargin}" dy="14">Dim: ${piece.w_mm}×${piece.h_mm}mm${piece.rotated ? ' (rot)' : ''}</tspan>
    <tspan x="${svgMargin}" dy="14">Hoja #${piece.sheet_index} @ ${piece.x_mm},${piece.y_mm}</tspan>
    ${bandingText ? `<tspan x="${svgMargin}" dy="14">Cantos: ${bandingText}</tspan>` : ''}
  </text>
</svg>`;
  
  return svg;
}

// Generate SVG label for a sheet
async function generateSheetLabel(sheet, projectId, labelConfig, totalPieces) {
  const [width, height] = labelConfig.label_size_mm;
  const margin = labelConfig.margin_mm;
  const qrSize = labelConfig.qr_size_mm;
  const fontSize = labelConfig.font_size_pt;
  
  // Convert mm to pixels
  const mmToPx = (mm) => mm * 3.7795;
  
  const svgWidth = mmToPx(width);
  const svgHeight = mmToPx(height);
  const svgMargin = mmToPx(margin);
  const svgQrSize = mmToPx(qrSize);
  
  // Prepare QR payload
  let qrData;
  if (labelConfig.qr_payload === 'url' && labelConfig.base_url) {
    qrData = `${labelConfig.base_url}/p/${projectId}/sheet/${sheet.sheet_index}?m=${sheet.material_id}`;
  } else {
    // JSON payload
    qrData = JSON.stringify({
      p: projectId,
      sheet: sheet.sheet_index,
      m: sheet.material_id
    });
  }
  
  // Generate QR code as SVG string
  const qrSvg = await QRCode.toString(qrData, {
    type: 'svg',
    width: svgQrSize,
    margin: 0
  });
  
  // Extract just the QR path from the generated SVG
  const qrMatch = qrSvg.match(/<path[^>]*d="([^"]+)"/);
  const qrPath = qrMatch ? qrMatch[1] : '';
  
  // Get sheet dimensions
  const sheetDims = sheet.sheet_mm || [1220, 2440];
  
  // Create SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <!-- Border -->
  <rect x="1" y="1" width="${svgWidth - 2}" height="${svgHeight - 2}" fill="none" stroke="black" stroke-width="1"/>
  
  <!-- QR Code -->
  <g transform="translate(${svgWidth - svgQrSize - svgMargin}, ${svgMargin})">
    <rect x="0" y="0" width="${svgQrSize}" height="${svgQrSize}" fill="white"/>
    <path d="${qrPath}" fill="black" transform="scale(${svgQrSize / 256})"/>
  </g>
  
  <!-- Text content -->
  <text x="${svgMargin}" y="${svgMargin + 12}" font-family="Arial, sans-serif" font-size="${fontSize}pt" fill="black">
    <tspan x="${svgMargin}" dy="0">Proyecto: ${projectId}</tspan>
    <tspan x="${svgMargin}" dy="14">Hoja #${sheet.sheet_index}</tspan>
    <tspan x="${svgMargin}" dy="14">Material: ${sheet.material_id.split('.').pop()}</tspan>
    <tspan x="${svgMargin}" dy="14">Tamaño: ${sheetDims[0]}×${sheetDims[1]}mm</tspan>
    <tspan x="${svgMargin}" dy="14">Piezas: ${sheet.placements_count}</tspan>
  </text>
</svg>`;
  
  return svg;
}

// Save BOM as Markdown
function saveBOMMarkdown(bom) {
  const reportPath = path.join(__dirname, '..', 'reports', `bom-${bom.projectId}.md`);
  
  let md = `# Bill of Materials - ${bom.projectId}\n\n`;
  md += `**Generado:** ${new Date().toISOString().split('T')[0]}\n\n`;
  
  // Materials section
  md += `## Materiales\n\n`;
  
  if (Object.keys(bom.materials.panels).length > 0) {
    md += `### Paneles\n\n`;
    md += `| Material | Hojas | Área Total (m²) | Área Piezas (m²) | Merma (%) |\n`;
    md += `|----------|-------|-----------------|------------------|----------|\n`;
    
    for (const [materialId, data] of Object.entries(bom.materials.panels)) {
      md += `| ${materialId} | ${data.sheets_used} | ${data.total_sheet_area_m2.toFixed(2)} | ${data.pieces_area_m2.toFixed(2)} | ${(data.waste_pct * 100).toFixed(1)} |\n`;
    }
    md += `\n`;
  }
  
  if (Object.keys(bom.materials.countertops).length > 0) {
    md += `### Encimeras\n\n`;
    md += `| Material | Área (m²) |\n`;
    md += `|----------|----------|\n`;
    
    for (const [materialId, data] of Object.entries(bom.materials.countertops)) {
      md += `| ${materialId} | ${data.area_m2.toFixed(2)} |\n`;
    }
    md += `\n`;
  }
  
  // Hardware section
  if (Object.keys(bom.hardware).length > 0) {
    md += `## Herrajes\n\n`;
    md += `| Item | Cantidad |\n`;
    md += `|------|----------|\n`;
    
    for (const [itemId, data] of Object.entries(bom.hardware)) {
      md += `| ${itemId} | ${data.count} |\n`;
    }
    md += `\n`;
  }
  
  // Adhesives section
  if (bom.adhesives.length > 0) {
    md += `## Adhesivos\n\n`;
    md += `| ID | Estación |\n`;
    md += `|----|----------|\n`;
    
    for (const adhesive of bom.adhesives) {
      md += `| ${adhesive.id} | ${adhesive.estacion} |\n`;
    }
    md += `\n`;
  }
  
  // Sheets summary
  md += `## Resumen por Hoja\n\n`;
  md += `| Material | Hoja # | Piezas |\n`;
  md += `|----------|--------|--------|\n`;
  
  for (const sheet of bom.sheets) {
    md += `| ${sheet.material_id} | ${sheet.sheet_index} | ${sheet.placements_count} |\n`;
  }
  md += `\n`;
  
  // Pieces summary
  md += `## Total de Piezas: ${bom.pieces.length}\n`;
  
  fs.writeFileSync(reportPath, md);
  console.log(`${colors.gray}BOM Markdown saved: reports/bom-${bom.projectId}.md${colors.reset}`);
}

// Save labels manifest
function saveLabelsManifest(projectId, pieceFiles, sheetFiles) {
  const manifestPath = path.join(__dirname, '..', 'reports', `labels-manifest-${projectId}.csv`);
  
  let csv = 'type,filename,id_or_uid,material_id,sheet_index\n';
  
  // Add piece labels
  pieceFiles.forEach(file => {
    const match = file.filename.match(/piece-(.+)\.svg$/);
    if (match) {
      csv += `piece,${file.filename},${match[1]},${file.material_id},${file.sheet_index}\n`;
    }
  });
  
  // Add sheet labels
  sheetFiles.forEach(file => {
    const match = file.filename.match(/sheet-(.+)-(\d+)\.svg$/);
    if (match) {
      csv += `sheet,${file.filename},sheet-${match[2]},${match[1]},${match[2]}\n`;
    }
  });
  
  fs.writeFileSync(manifestPath, csv);
  console.log(`${colors.gray}Labels manifest saved: reports/labels-manifest-${projectId}.csv${colors.reset}`);
}

// Main execution
async function main() {
  const projectId = 'DEMO-001';
  
  console.log(`${colors.blue}${colors.bold}Generating BOM and labels for ${projectId}...${colors.reset}`);
  
  // Load configurations
  const labelConfig = loadLabelConfig();
  
  // Generate BOM
  const bom = generateBOM(projectId);
  
  // Save BOM JSON
  const projectDir = path.join(__dirname, '..', 'data', 'projects', projectId);
  const bomPath = path.join(projectDir, 'bom.json');
  fs.writeFileSync(bomPath, JSON.stringify(bom, null, 2));
  console.log(`${colors.gray}BOM JSON saved: data/projects/${projectId}/bom.json${colors.reset}`);
  
  // Save BOM Markdown
  saveBOMMarkdown(bom);
  
  // Create labels directories
  const labelsDir = path.join(projectDir, 'labels');
  const piecesLabelsDir = path.join(labelsDir, 'pieces');
  const sheetsLabelsDir = path.join(labelsDir, 'sheets');
  
  if (!fs.existsSync(labelsDir)) {
    fs.mkdirSync(labelsDir, { recursive: true });
  }
  if (!fs.existsSync(piecesLabelsDir)) {
    fs.mkdirSync(piecesLabelsDir, { recursive: true });
  }
  if (!fs.existsSync(sheetsLabelsDir)) {
    fs.mkdirSync(sheetsLabelsDir, { recursive: true });
  }
  
  // Generate piece labels
  const pieceFiles = [];
  for (const piece of bom.pieces) {
    const svg = await generatePieceLabel(piece, projectId, labelConfig);
    const filename = `piece-${piece.piece_uid}.svg`;
    const filepath = path.join(piecesLabelsDir, filename);
    fs.writeFileSync(filepath, svg);
    pieceFiles.push({
      filename,
      material_id: piece.material_id,
      sheet_index: piece.sheet_index
    });
  }
  
  // Generate sheet labels
  const sheetFiles = [];
  for (const sheet of bom.sheets) {
    // Get sheet dimensions from materials
    const materialData = bom.materials.panels[sheet.material_id];
    if (materialData) {
      sheet.sheet_mm = materialData.sheet_mm;
    }
    
    const svg = await generateSheetLabel(sheet, projectId, labelConfig, sheet.placements_count);
    const filename = `sheet-${sheet.material_id}-${sheet.sheet_index}.svg`;
    const filepath = path.join(sheetsLabelsDir, filename);
    fs.writeFileSync(filepath, svg);
    sheetFiles.push({
      filename,
      material_id: sheet.material_id,
      sheet_index: sheet.sheet_index
    });
  }
  
  // Save labels manifest
  saveLabelsManifest(projectId, pieceFiles, sheetFiles);
  
  // Print summary
  const totalPanelArea = Object.values(bom.materials.panels)
    .reduce((sum, m) => sum + m.total_sheet_area_m2, 0);
  const totalSheets = Object.values(bom.materials.panels)
    .reduce((sum, m) => sum + m.sheets_used, 0);
  const guiasCount = Object.entries(bom.hardware)
    .filter(([k]) => k.includes('guia'))
    .reduce((sum, [, v]) => sum + v.count, 0);
  const bisagrasCount = Object.entries(bom.hardware)
    .filter(([k]) => k.includes('bisagra'))
    .reduce((sum, [, v]) => sum + v.count, 0);
  
  console.log(`${colors.cyan}📦 BOM: materials(panels=${totalPanelArea.toFixed(2)} m²; sheets=${totalSheets}) | hardware(G=${guiasCount}, B=${bisagrasCount}) | adhesives(${bom.adhesives.length} items)${colors.reset}`);
  console.log(`${colors.cyan}🏷️ Labels: pieces ${pieceFiles.length} + sheets ${sheetFiles.length} → saved to data/projects/${projectId}/labels/${colors.reset}`);
  
  console.log(`${colors.green}${colors.bold}✅ BOM and labels generation complete${colors.reset}`);
}

main();