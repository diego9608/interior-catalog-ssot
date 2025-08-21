const fs = require('fs');
const path = require('path');

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

// Load cutting configuration
function loadCuttingConfig() {
  const configPath = path.join(__dirname, '..', 'data', 'catalog', 'cutting', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`${colors.red}Cutting config not found: ${configPath}${colors.reset}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Load pricing catalog for sheet sizes
function loadPanelsPricing() {
  const pricingPath = path.join(__dirname, '..', 'data', 'catalog', 'pricing', 'paneles.tableros.json');
  if (fs.existsSync(pricingPath)) {
    return JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
  }
  return { items: {} };
}

// Parse CSV file
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const obj = {};
    headers.forEach((header, i) => {
      obj[header.trim()] = values[i] || '';
    });
    return obj;
  });
}

// Expand pieces by quantity
function expandPieces(pieces) {
  const expanded = [];
  
  for (const piece of pieces) {
    const qty = parseInt(piece.qty) || 1;
    const w = parseInt(piece.w_mm);
    const h = parseInt(piece.h_mm);
    const canRotate = piece.rotate === 'true';
    
    for (let i = 0; i < qty; i++) {
      expanded.push({
        id: piece.piece_id,
        material: piece.material_id,
        width: w,
        height: h,
        canRotate,
        banding: piece.banding || '-',
        notes: piece.notes || '',
        original: piece
      });
    }
  }
  
  return expanded;
}

// Shelf/Guillotine packing algorithm
class ShelfPacker {
  constructor(sheetWidth, sheetHeight, kerf, minOffcut) {
    this.sheetWidth = sheetWidth;
    this.sheetHeight = sheetHeight;
    this.kerf = kerf;
    this.minOffcut = minOffcut;
    this.sheets = [];
    this.currentSheet = null;
  }
  
  startNewSheet() {
    this.currentSheet = {
      shelves: [],
      currentY: 0,
      placements: [],
      offcuts: []
    };
    this.sheets.push(this.currentSheet);
  }
  
  canFitPiece(piece, rotated = false) {
    const w = rotated ? piece.height : piece.width;
    const h = rotated ? piece.width : piece.height;
    
    // Check if piece exceeds sheet dimensions
    if (w > this.sheetWidth || h > this.sheetHeight) {
      return false;
    }
    
    return true;
  }
  
  packPiece(piece) {
    // Try both orientations if rotation is allowed
    const orientations = piece.canRotate ? 
      [{w: piece.width, h: piece.height, rotated: false}, 
       {w: piece.height, h: piece.width, rotated: true}] :
      [{w: piece.width, h: piece.height, rotated: false}];
    
    for (const orientation of orientations) {
      if (!this.canFitPiece(piece, orientation.rotated)) {
        continue;
      }
      
      // Try to place in existing sheet
      for (let sheetIdx = 0; sheetIdx < this.sheets.length; sheetIdx++) {
        const sheet = this.sheets[sheetIdx];
        const placement = this.tryPlaceInSheet(sheet, piece, orientation);
        if (placement) {
          placement.sheet = sheetIdx + 1;
          sheet.placements.push(placement);
          return placement;
        }
      }
    }
    
    // Need new sheet
    this.startNewSheet();
    
    for (const orientation of orientations) {
      if (!this.canFitPiece(piece, orientation.rotated)) {
        continue;
      }
      
      const placement = this.tryPlaceInSheet(this.currentSheet, piece, orientation);
      if (placement) {
        placement.sheet = this.sheets.length;
        this.currentSheet.placements.push(placement);
        return placement;
      }
    }
    
    return null;
  }
  
  tryPlaceInSheet(sheet, piece, orientation) {
    const w = orientation.w;
    const h = orientation.h;
    
    // Try to place in existing shelves
    for (const shelf of sheet.shelves) {
      if (shelf.height >= h && shelf.remainingWidth >= w + this.kerf) {
        // Place in this shelf
        const placement = {
          piece_id: piece.id,
          material_id: piece.material,
          x: shelf.currentX,
          y: shelf.y,
          w: piece.width,
          h: piece.height,
          rotated: orientation.rotated,
          banding: piece.banding
        };
        
        shelf.currentX += w + this.kerf;
        shelf.remainingWidth -= (w + this.kerf);
        
        return placement;
      }
    }
    
    // Create new shelf if possible
    const remainingHeight = this.sheetHeight - sheet.currentY;
    if (remainingHeight >= h + this.kerf) {
      const shelf = {
        y: sheet.currentY,
        height: h,
        currentX: 0,
        remainingWidth: this.sheetWidth
      };
      
      const placement = {
        piece_id: piece.id,
        material_id: piece.material,
        x: 0,
        y: sheet.currentY,
        w: piece.width,
        h: piece.height,
        rotated: orientation.rotated,
        banding: piece.banding
      };
      
      shelf.currentX = w + this.kerf;
      shelf.remainingWidth = this.sheetWidth - w - this.kerf;
      sheet.shelves.push(shelf);
      sheet.currentY += h + this.kerf;
      
      return placement;
    }
    
    return null;
  }
  
  calculateOffcuts() {
    for (let sheetIdx = 0; sheetIdx < this.sheets.length; sheetIdx++) {
      const sheet = this.sheets[sheetIdx];
      
      // Find used area boundaries
      let maxX = 0;
      let maxY = 0;
      
      for (const placement of sheet.placements) {
        const endX = placement.x + (placement.rotated ? placement.h : placement.w);
        const endY = placement.y + (placement.rotated ? placement.w : placement.h);
        maxX = Math.max(maxX, endX);
        maxY = Math.max(maxY, endY);
      }
      
      // Check right offcut
      if (this.sheetWidth - maxX >= this.minOffcut[0]) {
        sheet.offcuts.push({
          sheet: sheetIdx + 1,
          x: maxX + this.kerf,
          y: 0,
          w: this.sheetWidth - maxX - this.kerf,
          h: this.sheetHeight
        });
      }
      
      // Check bottom offcut
      if (this.sheetHeight - maxY >= this.minOffcut[1]) {
        sheet.offcuts.push({
          sheet: sheetIdx + 1,
          x: 0,
          y: maxY + this.kerf,
          w: maxX,
          h: this.sheetHeight - maxY - this.kerf
        });
      }
    }
  }
}

// Generate SVG visualization
function generateSVG(material, sheets, sheetWidth, sheetHeight, projectId) {
  const scale = 0.4; // Scale to fit in reasonable size
  const margin = 20;
  const spacing = 30;
  
  const svgWidth = sheets.length * (sheetWidth * scale + spacing) + margin * 2 - spacing;
  const svgHeight = sheetHeight * scale + margin * 2;
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <style>\n`;
  svg += `    .sheet { fill: #f0f0f0; stroke: #333; stroke-width: 2; }\n`;
  svg += `    .piece { fill: #a0c4ff; stroke: #004494; stroke-width: 1; }\n`;
  svg += `    .offcut { fill: #ffcccc; stroke: #cc0000; stroke-width: 1; stroke-dasharray: 5,5; }\n`;
  svg += `    .label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; }\n`;
  svg += `    .title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #333; }\n`;
  svg += `  </style>\n`;
  
  // Title
  svg += `  <text x="${svgWidth/2}" y="15" class="title" text-anchor="middle">Cut Layout - ${projectId} - ${material}</text>\n`;
  
  for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
    const sheet = sheets[sheetIdx];
    const offsetX = margin + sheetIdx * (sheetWidth * scale + spacing);
    const offsetY = margin;
    
    // Draw sheet background
    svg += `  <rect x="${offsetX}" y="${offsetY}" width="${sheetWidth * scale}" height="${sheetHeight * scale}" class="sheet"/>\n`;
    
    // Draw pieces
    for (const placement of sheet.placements) {
      const x = offsetX + placement.x * scale;
      const y = offsetY + placement.y * scale;
      const w = (placement.rotated ? placement.h : placement.w) * scale;
      const h = (placement.rotated ? placement.w : placement.h) * scale;
      
      svg += `  <rect x="${x}" y="${y}" width="${w}" height="${h}" class="piece"/>\n`;
      
      // Add label
      const labelX = x + w / 2;
      const labelY = y + h / 2;
      svg += `  <text x="${labelX}" y="${labelY}" class="label" text-anchor="middle" dominant-baseline="middle">${placement.piece_id}</text>\n`;
    }
    
    // Draw offcuts
    for (const offcut of sheet.offcuts) {
      if (offcut.sheet === sheetIdx + 1) {
        const x = offsetX + offcut.x * scale;
        const y = offsetY + offcut.y * scale;
        const w = offcut.w * scale;
        const h = offcut.h * scale;
        
        svg += `  <rect x="${x}" y="${y}" width="${w}" height="${h}" class="offcut"/>\n`;
      }
    }
    
    // Sheet number
    svg += `  <text x="${offsetX + sheetWidth * scale / 2}" y="${offsetY + sheetHeight * scale + 15}" class="label" text-anchor="middle">Sheet ${sheetIdx + 1}</text>\n`;
  }
  
  svg += `</svg>`;
  return svg;
}

// Main execution
function main() {
  console.log(`${colors.blue}${colors.bold}Loading configuration...${colors.reset}`);
  
  const config = loadCuttingConfig();
  const panelsPricing = loadPanelsPricing();
  
  // Process all projects
  const projectsDir = path.join(__dirname, '..', 'data', 'projects');
  const projects = fs.readdirSync(projectsDir).filter(dir => {
    const piecesPath = path.join(projectsDir, dir, 'pieces.csv');
    return fs.statSync(path.join(projectsDir, dir)).isDirectory() && fs.existsSync(piecesPath);
  });
  
  for (const projectId of projects) {
    console.log(`\n${colors.cyan}${colors.bold}Processing project: ${projectId}${colors.reset}`);
    
    const piecesPath = path.join(projectsDir, projectId, 'pieces.csv');
    const pieces = parseCSV(piecesPath);
    const expandedPieces = expandPieces(pieces);
    
    // Group pieces by material
    const piecesByMaterial = {};
    for (const piece of expandedPieces) {
      if (!piecesByMaterial[piece.material]) {
        piecesByMaterial[piece.material] = [];
      }
      piecesByMaterial[piece.material].push(piece);
    }
    
    const report = {
      projectId,
      material_sheets: {}
    };
    
    const allPlacements = [];
    
    // Process each material
    for (const [material, materialPieces] of Object.entries(piecesByMaterial)) {
      console.log(`${colors.gray}Processing material: ${material}${colors.reset}`);
      
      // Get sheet size
      let sheetSize = config.default_sheet_mm;
      if (panelsPricing.items?.[material]?.sheet_mm) {
        sheetSize = panelsPricing.items[material].sheet_mm;
      }
      
      // Get material config
      const materialConfig = config.materials[material] || { rotate: true, grain: 'none' };
      
      // Sort pieces by largest dimension (descending)
      materialPieces.sort((a, b) => {
        const maxA = Math.max(a.width, a.height);
        const maxB = Math.max(b.width, b.height);
        return maxB - maxA;
      });
      
      // Apply rotation settings
      for (const piece of materialPieces) {
        piece.canRotate = piece.canRotate && materialConfig.rotate;
      }
      
      // Pack pieces
      const packer = new ShelfPacker(
        sheetSize[0],
        sheetSize[1],
        config.saw_kerf_mm,
        config.min_offcut_mm
      );
      
      packer.startNewSheet();
      
      for (const piece of materialPieces) {
        const placement = packer.packPiece(piece);
        if (!placement) {
          console.error(`${colors.red}E-CUT-001 Piece too large: ${piece.id} (${piece.width}x${piece.height})${colors.reset}`);
          process.exit(1);
        }
        allPlacements.push(placement);
      }
      
      // Calculate offcuts
      packer.calculateOffcuts();
      
      // Calculate metrics
      const sheetsUsed = packer.sheets.length;
      const sheetAreaM2 = (sheetSize[0] * sheetSize[1]) / 1e6;
      const totalSheetAreaM2 = sheetsUsed * sheetAreaM2;
      
      let piecesAreaM2 = 0;
      for (const piece of materialPieces) {
        piecesAreaM2 += (piece.width * piece.height) / 1e6;
      }
      
      const wasteAreaM2 = totalSheetAreaM2 - piecesAreaM2;
      const wastePct = wasteAreaM2 / totalSheetAreaM2;
      
      // Collect all placements and offcuts
      const allMaterialPlacements = [];
      const allOffcuts = [];
      
      for (const sheet of packer.sheets) {
        allMaterialPlacements.push(...sheet.placements);
        allOffcuts.push(...sheet.offcuts);
      }
      
      report.material_sheets[material] = {
        sheet_mm: sheetSize,
        kerf_mm: config.saw_kerf_mm,
        sheets_used: sheetsUsed,
        sheet_area_m2: parseFloat(sheetAreaM2.toFixed(4)),
        pieces_area_m2: parseFloat(piecesAreaM2.toFixed(4)),
        waste_area_m2: parseFloat(wasteAreaM2.toFixed(4)),
        waste_pct: parseFloat(wastePct.toFixed(3)),
        placements: allMaterialPlacements,
        offcuts: allOffcuts
      };
      
      console.log(`${colors.green}✂️ Cut Optimizer: ${sheetsUsed} sheets used | waste ${(wastePct * 100).toFixed(1)}% | material ${material}${colors.reset}`);
      
      // Generate SVG
      const svg = generateSVG(material, packer.sheets, sheetSize[0], sheetSize[1], projectId);
      const svgPath = path.join(__dirname, '..', 'reports', `cuts-${projectId}.svg`);
      fs.writeFileSync(svgPath, svg);
    }
    
    // Save cutlist CSV
    const cutlistPath = path.join(projectsDir, projectId, 'cutlist.csv');
    let csvContent = 'piece_id,material_id,sheet_index,x_mm,y_mm,w_mm,h_mm,rotated,banding\n';
    
    for (const placement of allPlacements) {
      csvContent += `${placement.piece_id},${placement.material_id},${placement.sheet},`;
      csvContent += `${placement.x},${placement.y},${placement.w},${placement.h},`;
      csvContent += `${placement.rotated},${placement.banding}\n`;
    }
    
    fs.writeFileSync(cutlistPath, csvContent);
    
    // Save JSON report
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, `cuts-${projectId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`${colors.blue}🧾 Saved: cutlist.csv, cuts-${projectId}.json, cuts-${projectId}.svg${colors.reset}`);
  }
  
  console.log(`\n${colors.green}${colors.bold}✅ Cut optimization complete${colors.reset}`);
}

main();