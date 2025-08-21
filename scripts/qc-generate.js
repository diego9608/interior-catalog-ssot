const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

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

// Load QC checklists configuration
function loadChecklists() {
  const checklistPath = path.join(__dirname, '..', 'data', 'catalog', 'qc', 'checklists.core.yaml');
  if (!fs.existsSync(checklistPath)) {
    console.error(`${colors.red}E-QC-001: Missing checklists.core.yaml${colors.reset}`);
    process.exit(1);
  }
  const content = fs.readFileSync(checklistPath, 'utf8');
  return yaml.parse(content);
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

// Calculate automatic values
function calculateAutoValues(projectId) {
  const autoValues = {};
  
  // Calculate pieces.total_qty from pieces.csv
  const piecesPath = path.join(__dirname, '..', 'data', 'projects', projectId, 'pieces.csv');
  if (fs.existsSync(piecesPath)) {
    const pieces = parseCSV(piecesPath);
    autoValues['pieces.total_qty'] = pieces.reduce((sum, p) => {
      const qty = parseInt(p.qty) || 0;
      return sum + qty;
    }, 0);
  }
  
  // Calculate cuts.placements_total from cuts report
  const cutsReportPath = path.join(__dirname, '..', 'reports', `cuts-${projectId}.json`);
  if (fs.existsSync(cutsReportPath)) {
    const cutsReport = JSON.parse(fs.readFileSync(cutsReportPath, 'utf8'));
    let placementsTotal = 0;
    
    if (cutsReport.material_sheets) {
      for (const [materialId, materialData] of Object.entries(cutsReport.material_sheets)) {
        if (materialData.placements) {
          placementsTotal += materialData.placements.length;
        }
      }
    }
    
    autoValues['cuts.placements_total'] = placementsTotal;
  }
  
  return autoValues;
}

// Generate QC template for a phase
function generatePhaseTemplate(projectId, phaseName, phaseConfig, autoValues) {
  const template = {
    projectId,
    phase: phaseName,
    generated_at: new Date().toISOString(),
    gate: phaseConfig.gate,
    items: []
  };
  
  for (const item of phaseConfig.items) {
    const itemTemplate = {
      id: item.id,
      desc: item.desc,
      type: item.type,
      severity: item.severity,
      evidence: item.evidence
    };
    
    // Add type-specific fields
    if (item.type === 'auto_eq') {
      itemTemplate.left = item.left;
      itemTemplate.right = item.right;
      itemTemplate.left_value = autoValues[item.left];
      itemTemplate.right_value = autoValues[item.right];
      itemTemplate.requires_input = false;
    } else if (item.type === 'number_range') {
      itemTemplate.min = item.min;
      itemTemplate.max = item.max;
      itemTemplate.units = item.units;
      itemTemplate.requires_input = true;
      itemTemplate.input_field = item.id;
    } else if (item.type === 'number_max') {
      itemTemplate.max = item.max;
      itemTemplate.units = item.units;
      itemTemplate.requires_input = true;
      itemTemplate.input_field = item.id;
    } else if (item.type === 'bool_true') {
      itemTemplate.requires_input = true;
      itemTemplate.input_field = item.id;
    }
    
    template.items.push(itemTemplate);
  }
  
  return template;
}

// Generate blank checklist PDF
function generateChecklistPDF(projectId, checklists) {
  return new Promise((resolve, reject) => {
    const pdfPath = path.join(__dirname, '..', 'reports', `qc-${projectId}-checklist.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    
    doc.pipe(stream);
    
    // Title page
    doc.fontSize(20).text('QC Checklist', { align: 'center' });
    doc.fontSize(16).text(`Proyecto: ${projectId}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generado: ${dayjs().format('YYYY-MM-DD HH:mm')}`, { align: 'center' });
    
    // Process each phase
    for (const [phaseName, phaseConfig] of Object.entries(checklists.phases)) {
      doc.addPage();
      
      // Phase header
      doc.fontSize(18).text(`Fase: ${phaseName.replace('_', ' ').toUpperCase()}`, { underline: true });
      doc.moveDown();
      
      // Metadata fields
      doc.fontSize(10);
      doc.text('Responsable: _________________________________');
      doc.text('Estación: _____________________________________');
      doc.text('Fecha: ________________________________________');
      doc.moveDown();
      
      // Items table header
      doc.fontSize(9);
      const tableTop = doc.y;
      const colWidths = [50, 180, 60, 60, 50, 60, 60];
      const colX = [50, 100, 280, 340, 400, 450, 510];
      
      // Draw header
      doc.font('Helvetica-Bold');
      doc.text('ID', colX[0], tableTop);
      doc.text('Descripción', colX[1], tableTop);
      doc.text('Unidad', colX[2], tableTop);
      doc.text('Valor', colX[3], tableTop);
      doc.text('PASS', colX[4], tableTop);
      doc.text('Severidad', colX[5], tableTop);
      doc.text('Evidencia', colX[6], tableTop);
      doc.font('Helvetica');
      
      // Draw line under header
      doc.moveTo(50, tableTop + 15)
         .lineTo(550, tableTop + 15)
         .stroke();
      
      // Draw items
      let y = tableTop + 20;
      for (const item of phaseConfig.items) {
        if (y > 750) {
          doc.addPage();
          y = 50;
        }
        
        doc.fontSize(8);
        doc.text(item.id, colX[0], y, { width: colWidths[0] });
        doc.text(item.desc, colX[1], y, { width: colWidths[1] });
        doc.text(item.units || '-', colX[2], y, { width: colWidths[2] });
        
        // Value field (empty box or range hint)
        if (item.type === 'number_range') {
          doc.text(`${item.min}-${item.max}`, colX[3], y, { width: colWidths[3] });
        } else if (item.type === 'number_max') {
          doc.text(`≤${item.max}`, colX[3], y, { width: colWidths[3] });
        } else if (item.type === 'bool_true') {
          doc.text('Sí/No', colX[3], y, { width: colWidths[3] });
        } else if (item.type === 'auto_eq') {
          doc.text('AUTO', colX[3], y, { width: colWidths[3] });
        } else {
          doc.text('_____', colX[3], y, { width: colWidths[3] });
        }
        
        // PASS checkbox
        doc.rect(colX[4] + 15, y, 10, 10).stroke();
        
        // Severity
        doc.text(item.severity, colX[5], y, { width: colWidths[5] });
        
        // Evidence
        doc.text(item.evidence || '-', colX[6], y, { width: colWidths[6] });
        
        y += 25;
      }
      
      // Signature section
      doc.moveDown(2);
      doc.fontSize(10);
      doc.text('Firma del responsable: _________________________________');
      doc.text('Observaciones:');
      doc.rect(50, doc.y + 5, 500, 60).stroke();
    }
    
    doc.end();
    
    stream.on('finish', () => {
      console.log(`${colors.gray}PDF checklist saved: reports/qc-${projectId}-checklist.pdf${colors.reset}`);
      resolve(pdfPath);
    });
    
    stream.on('error', reject);
  });
}

// Main execution
async function main() {
  const projectId = 'DEMO-001';
  
  console.log(`${colors.blue}${colors.bold}Generating QC templates for ${projectId}...${colors.reset}`);
  
  // Load configurations
  const checklists = loadChecklists();
  
  // Calculate automatic values
  const autoValues = calculateAutoValues(projectId);
  console.log(`${colors.gray}Auto values: pieces.total_qty=${autoValues['pieces.total_qty']}, cuts.placements_total=${autoValues['cuts.placements_total']}${colors.reset}`);
  
  // Create QC directory
  const qcDir = path.join(__dirname, '..', 'data', 'projects', projectId, 'qc');
  if (!fs.existsSync(qcDir)) {
    fs.mkdirSync(qcDir, { recursive: true });
  }
  
  // Generate templates for each phase
  const phaseCounts = {};
  for (const [phaseName, phaseConfig] of Object.entries(checklists.phases)) {
    const template = generatePhaseTemplate(projectId, phaseName, phaseConfig, autoValues);
    
    // Save template
    const templatePath = path.join(qcDir, `template.${phaseName}.json`);
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
    console.log(`${colors.gray}Template saved: data/projects/${projectId}/qc/template.${phaseName}.json${colors.reset}`);
    
    phaseCounts[phaseName] = phaseConfig.items.length;
  }
  
  // Generate blank checklist PDF
  await generateChecklistPDF(projectId, checklists);
  
  // Print summary
  const phasesSummary = Object.entries(phaseCounts)
    .map(([phase, count]) => `${phase}(${count} items)`)
    .join(', ');
  
  console.log(`${colors.cyan}📝 QC templates: ${phasesSummary}${colors.reset}`);
  console.log(`${colors.green}${colors.bold}✅ QC generation complete${colors.reset}`);
}

main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});