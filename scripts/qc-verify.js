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

// Load phase inputs
function loadPhaseInputs(projectId, phaseName) {
  const inputsPath = path.join(__dirname, '..', 'data', 'projects', projectId, 'qc', 'inputs', `${phaseName}.json`);
  
  if (!fs.existsSync(inputsPath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(inputsPath, 'utf8'));
}

// Evaluate a single item
function evaluateItem(item, inputData, autoValues) {
  const result = {
    id: item.id,
    desc: item.desc,
    type: item.type,
    severity: item.severity,
    pass: false,
    value: null,
    reason: null
  };
  
  if (item.type === 'auto_eq') {
    const leftValue = autoValues[item.left];
    const rightValue = autoValues[item.right];
    result.value = `${leftValue} vs ${rightValue}`;
    result.pass = leftValue === rightValue;
    if (!result.pass) {
      result.reason = `Expected ${item.left}(${leftValue}) to equal ${item.right}(${rightValue})`;
    }
  } else if (item.type === 'number_range') {
    const value = inputData?.answers?.[item.id];
    if (value === undefined || value === null) {
      result.reason = 'No input provided';
      return result;
    }
    result.value = value;
    result.pass = value >= item.min && value <= item.max;
    if (!result.pass) {
      result.reason = `Value ${value} outside range [${item.min}, ${item.max}] ${item.units}`;
    }
  } else if (item.type === 'number_max') {
    const value = inputData?.answers?.[item.id];
    if (value === undefined || value === null) {
      result.reason = 'No input provided';
      return result;
    }
    result.value = value;
    result.pass = value <= item.max;
    if (!result.pass) {
      result.reason = `Value ${value} exceeds maximum ${item.max} ${item.units}`;
    }
  } else if (item.type === 'bool_true') {
    const value = inputData?.answers?.[item.id];
    if (value === undefined || value === null) {
      result.reason = 'No input provided';
      return result;
    }
    result.value = value;
    result.pass = value === true;
    if (!result.pass) {
      result.reason = `Expected true, got ${value}`;
    }
  }
  
  return result;
}

// Evaluate a phase
function evaluatePhase(phaseName, phaseConfig, inputData, autoValues) {
  const results = {
    phase: phaseName,
    pass: true,
    high_fails: 0,
    medium_fails: 0,
    low_fails: 0,
    failed_items: [],
    items: [],
    responsable: inputData?.responsable || 'N/A',
    station: inputData?.station || 'N/A',
    timestamp: inputData?.timestamp || new Date().toISOString()
  };
  
  // If no input data, mark as pending
  if (!inputData) {
    results.pass = null;
    results.status = 'pending';
    results.summary = 'Phase not yet evaluated';
    return results;
  }
  
  // Evaluate each item
  for (const item of phaseConfig.items) {
    const itemResult = evaluateItem(item, inputData, autoValues);
    results.items.push(itemResult);
    
    if (!itemResult.pass) {
      if (item.severity === 'high') {
        results.high_fails++;
        results.failed_items.push(item.id);
      } else if (item.severity === 'medium') {
        results.medium_fails++;
      } else if (item.severity === 'low') {
        results.low_fails++;
      }
    }
  }
  
  // Apply gate logic
  if (phaseConfig.gate?.high_fail_blocks && results.high_fails > 0) {
    results.pass = false;
  }
  
  // Generate summary
  if (results.pass === false) {
    results.summary = `FAIL: ${results.high_fails} high, ${results.medium_fails} medium, ${results.low_fails} low failures`;
  } else if (results.pass === true) {
    results.summary = 'PASS: All checks passed';
  }
  
  return results;
}

// Generate results PDF
function generateResultsPDF(projectId, report) {
  return new Promise((resolve, reject) => {
    const pdfPath = path.join(__dirname, '..', 'reports', `qc-${projectId}-results.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    
    doc.pipe(stream);
    
    // Title page
    doc.fontSize(20).text('QC Results Report', { align: 'center' });
    doc.fontSize(16).text(`Proyecto: ${projectId}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generado: ${dayjs().format('YYYY-MM-DD HH:mm')}`, { align: 'center' });
    
    // Overall status
    doc.moveDown(2);
    let overallPass = true;
    for (const [phaseName, phaseData] of Object.entries(report.phases)) {
      if (phaseData.pass === false) {
        overallPass = false;
        break;
      }
    }
    
    doc.fontSize(14);
    if (overallPass) {
      doc.fillColor('green').text('ESTADO GENERAL: APROBADO', { align: 'center' });
    } else {
      doc.fillColor('red').text('ESTADO GENERAL: RECHAZADO', { align: 'center' });
    }
    doc.fillColor('black');
    
    // Process each phase
    for (const [phaseName, phaseData] of Object.entries(report.phases)) {
      doc.addPage();
      
      // Phase header
      doc.fontSize(18).text(`Fase: ${phaseName.replace('_', ' ').toUpperCase()}`, { underline: true });
      doc.moveDown();
      
      // Phase status
      doc.fontSize(12);
      if (phaseData.pass === true) {
        doc.fillColor('green').text('ESTADO: APROBADO');
      } else if (phaseData.pass === false) {
        doc.fillColor('red').text('ESTADO: RECHAZADO');
      } else {
        doc.fillColor('gray').text('ESTADO: PENDIENTE');
      }
      doc.fillColor('black');
      
      // Metadata
      doc.fontSize(10);
      doc.text(`Responsable: ${phaseData.responsable || 'N/A'}`);
      doc.text(`Estación: ${phaseData.station || 'N/A'}`);
      doc.text(`Fecha: ${dayjs(phaseData.timestamp).format('YYYY-MM-DD HH:mm')}`);
      doc.moveDown();
      
      if (phaseData.items && phaseData.items.length > 0) {
        // Items table
        doc.fontSize(9);
        const tableTop = doc.y;
        const colX = [50, 100, 280, 350, 420, 480];
        
        // Draw header
        doc.font('Helvetica-Bold');
        doc.text('ID', colX[0], tableTop);
        doc.text('Descripción', colX[1], tableTop);
        doc.text('Valor', colX[2], tableTop);
        doc.text('Estado', colX[3], tableTop);
        doc.text('Severidad', colX[4], tableTop);
        doc.text('Razón', colX[5], tableTop);
        doc.font('Helvetica');
        
        // Draw line under header
        doc.moveTo(50, tableTop + 15)
           .lineTo(550, tableTop + 15)
           .stroke();
        
        // Draw items
        let y = tableTop + 20;
        for (const item of phaseData.items) {
          if (y > 750) {
            doc.addPage();
            y = 50;
          }
          
          doc.fontSize(8);
          doc.text(item.id, colX[0], y, { width: 50 });
          doc.text(item.desc.substring(0, 40) + '...', colX[1], y, { width: 170 });
          doc.text(String(item.value || '-'), colX[2], y, { width: 60 });
          
          // Status
          if (item.pass) {
            doc.fillColor('green').text('PASS', colX[3], y, { width: 60 });
          } else {
            doc.fillColor('red').text('FAIL', colX[3], y, { width: 60 });
          }
          doc.fillColor('black');
          
          doc.text(item.severity, colX[4], y, { width: 50 });
          doc.text(item.reason || '-', colX[5], y, { width: 70 });
          
          y += 20;
        }
      }
      
      // Summary
      doc.moveDown(2);
      doc.fontSize(10);
      doc.text(`Resumen: ${phaseData.summary || 'N/A'}`);
      if (phaseData.high_fails > 0) {
        doc.fillColor('red').text(`Fallas críticas (high): ${phaseData.high_fails}`);
        doc.text(`Items fallidos: ${phaseData.failed_items.join(', ')}`);
        doc.fillColor('black');
      }
      
      // Signature section
      doc.moveDown(2);
      doc.text('Firma del responsable: _________________________________');
    }
    
    doc.end();
    
    stream.on('finish', () => {
      console.log(`${colors.gray}PDF results saved: reports/qc-${projectId}-results.pdf${colors.reset}`);
      resolve(pdfPath);
    });
    
    stream.on('error', reject);
  });
}

// Save report as Markdown
function saveMarkdownReport(projectId, report) {
  const mdPath = path.join(__dirname, '..', 'reports', `qc-${projectId}.md`);
  
  let md = `# QC Report - ${projectId}\n\n`;
  md += `**Generado:** ${dayjs().format('YYYY-MM-DD HH:mm')}\n\n`;
  
  // Overall status
  let overallPass = true;
  for (const [phaseName, phaseData] of Object.entries(report.phases)) {
    if (phaseData.pass === false) {
      overallPass = false;
      break;
    }
  }
  
  md += `## Estado General: ${overallPass ? '✅ APROBADO' : '❌ RECHAZADO'}\n\n`;
  
  // Phase summaries
  for (const [phaseName, phaseData] of Object.entries(report.phases)) {
    const phaseTitle = phaseName.replace('_', ' ').toUpperCase();
    const statusIcon = phaseData.pass === true ? '✅' : phaseData.pass === false ? '❌' : '⏳';
    
    md += `### ${statusIcon} ${phaseTitle}\n\n`;
    
    if (phaseData.status === 'pending') {
      md += `*Pendiente de evaluación*\n\n`;
      continue;
    }
    
    md += `- **Responsable:** ${phaseData.responsable || 'N/A'}\n`;
    md += `- **Estación:** ${phaseData.station || 'N/A'}\n`;
    md += `- **Fecha:** ${dayjs(phaseData.timestamp).format('YYYY-MM-DD HH:mm')}\n`;
    md += `- **Resumen:** ${phaseData.summary}\n\n`;
    
    if (phaseData.items && phaseData.items.length > 0) {
      md += `| Item | Descripción | Valor | Meta | Estado |\n`;
      md += `|------|-------------|-------|------|--------|\n`;
      
      for (const item of phaseData.items) {
        let meta = '-';
        if (item.type === 'number_range') {
          const itemConfig = report.checklists.phases[phaseName].items.find(i => i.id === item.id);
          if (itemConfig) {
            meta = `${itemConfig.min}-${itemConfig.max} ${itemConfig.units || ''}`;
          }
        } else if (item.type === 'number_max') {
          const itemConfig = report.checklists.phases[phaseName].items.find(i => i.id === item.id);
          if (itemConfig) {
            meta = `≤${itemConfig.max} ${itemConfig.units || ''}`;
          }
        } else if (item.type === 'bool_true') {
          meta = 'Sí';
        } else if (item.type === 'auto_eq') {
          meta = 'Igual';
        }
        
        const status = item.pass ? 'PASS' : 'FAIL';
        md += `| ${item.id} | ${item.desc} | ${item.value || '-'} | ${meta} | ${status} |\n`;
      }
      md += `\n`;
    }
    
    if (phaseData.high_fails > 0) {
      md += `**⚠️ Fallas críticas:** ${phaseData.failed_items.join(', ')}\n\n`;
    }
  }
  
  fs.writeFileSync(mdPath, md);
  console.log(`${colors.gray}Markdown report saved: reports/qc-${projectId}.md${colors.reset}`);
}

// Main execution
async function main() {
  const projectId = 'DEMO-001';
  
  console.log(`${colors.blue}${colors.bold}Verifying QC for ${projectId}...${colors.reset}`);
  
  // Load configurations
  const checklists = loadChecklists();
  
  // Calculate automatic values
  const autoValues = calculateAutoValues(projectId);
  
  // Initialize report
  const report = {
    projectId,
    generated_at: new Date().toISOString(),
    phases: {},
    responsables: {},
    checklists // Include for reference in markdown generation
  };
  
  let hasHighFails = false;
  
  // Evaluate each phase
  for (const [phaseName, phaseConfig] of Object.entries(checklists.phases)) {
    const inputData = loadPhaseInputs(projectId, phaseName);
    const phaseResults = evaluatePhase(phaseName, phaseConfig, inputData, autoValues);
    
    report.phases[phaseName] = phaseResults;
    
    if (inputData?.responsable) {
      report.responsables[phaseName] = inputData.responsable;
    }
    
    // Console output
    if (phaseResults.pass === true) {
      console.log(`${colors.green}✅ ${phaseName}: PASS (${phaseResults.high_fails} high fails)${colors.reset}`);
    } else if (phaseResults.pass === false) {
      const failedItemsStr = phaseResults.failed_items.length > 0 
        ? ` (${phaseResults.failed_items.join(', ')})` 
        : '';
      console.log(`${colors.red}❌ ${phaseName}: FAIL${failedItemsStr}${colors.reset}`);
      if (phaseResults.high_fails > 0) {
        hasHighFails = true;
      }
    } else {
      console.log(`${colors.yellow}⏳ ${phaseName}: PENDING${colors.reset}`);
    }
  }
  
  // Save JSON report
  const jsonPath = path.join(__dirname, '..', 'reports', `qc-${projectId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`${colors.gray}JSON report saved: reports/qc-${projectId}.json${colors.reset}`);
  
  // Save Markdown report
  saveMarkdownReport(projectId, report);
  
  // Generate results PDF
  await generateResultsPDF(projectId, report);
  
  // Check CI enforcement
  if (process.env.CI_QC_ENFORCE === 'true' && hasHighFails) {
    console.log(`${colors.red}${colors.bold}⛔ QC Gate: build blocked (high severity failures detected)${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`${colors.green}${colors.bold}✅ QC verification complete${colors.reset}`);
}

main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});