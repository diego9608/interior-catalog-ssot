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

// Process a single project
function processProject(projectId) {
  const projectDir = path.join(__dirname, '..', 'data', 'projects', projectId);
  const metrics = {
    projectId,
    cliente: null,
    cost_p50: null,
    cost_p80: null,
    timeline_days_p50: null,
    timeline_days_p80: null,
    panels_delta_vs_heuristic: null,
    optimization_savings_vs_naive: null,
    sheets_used: null,
    waste_pct: null,
    pieces_area_m2: null,
    total_sheet_area_m2: null,
    phase_status: {
      pre_cnc: { pass: null, high_fails: null },
      pre_instalacion: { pass: null, high_fails: null },
      entrega: { pass: null, high_fails: null }
    },
    qc_overall_pass: null,
    pieces_count: null,
    panels_materials: {},
    hardware: { guias: null, bisagras: null },
    generated_at: null
  };
  
  const warnings = [];
  const timestamps = [];
  
  // Load intake.json for cliente
  const intakePath = path.join(projectDir, 'intake.json');
  if (fs.existsSync(intakePath)) {
    const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
    metrics.cliente = intake.cliente || 'Cliente';
  }
  
  // Load costs report
  const costsPath = path.join(__dirname, '..', 'reports', `costs-${projectId}.json`);
  if (fs.existsSync(costsPath)) {
    const costs = JSON.parse(fs.readFileSync(costsPath, 'utf8'));
    metrics.cost_p50 = costs.totals?.p50 || null;
    metrics.cost_p80 = costs.totals?.p80 || null;
    metrics.timeline_days_p50 = costs.timeline_days?.p50 || null;
    metrics.timeline_days_p80 = costs.timeline_days?.p80 || null;
    
    // M5 override metrics
    if (costs.breakdown?.paneles?.override_real) {
      metrics.panels_delta_vs_heuristic = costs.breakdown.paneles.override_real.delta_vs_heuristic || null;
      metrics.optimization_savings_vs_naive = costs.breakdown.paneles.override_real.optimization_savings_vs_naive || null;
    }
    
    if (costs.generated_at) timestamps.push(costs.generated_at);
  } else {
    warnings.push(`missing costs report`);
  }
  
  // Load cuts report
  const cutsPath = path.join(__dirname, '..', 'reports', `cuts-${projectId}.json`);
  if (fs.existsSync(cutsPath)) {
    const cuts = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
    
    let totalSheetsUsed = 0;
    let totalPiecesArea = 0;
    let totalSheetArea = 0;
    let totalWasteArea = 0;
    
    if (cuts.material_sheets) {
      for (const [materialId, materialData] of Object.entries(cuts.material_sheets)) {
        const sheetsUsed = materialData.sheets_used || 0;
        totalSheetsUsed += sheetsUsed;
        
        const piecesArea = materialData.pieces_area_m2 || 0;
        totalPiecesArea += piecesArea;
        
        const sheetArea = materialData.sheet_area_m2 || 0;
        totalSheetArea += sheetArea * sheetsUsed;
        
        const wasteArea = materialData.waste_area_m2 || 0;
        totalWasteArea += wasteArea;
        
        metrics.panels_materials[materialId] = sheetsUsed;
      }
    }
    
    metrics.sheets_used = totalSheetsUsed;
    metrics.pieces_area_m2 = parseFloat(totalPiecesArea.toFixed(2));
    metrics.total_sheet_area_m2 = parseFloat(totalSheetArea.toFixed(2));
    
    if (totalSheetArea > 0) {
      metrics.waste_pct = parseFloat((totalWasteArea / totalSheetArea).toFixed(3));
    }
    
    if (cuts.generated_at) timestamps.push(cuts.generated_at);
  } else {
    warnings.push(`missing cuts report`);
  }
  
  // Load QC report
  const qcPath = path.join(__dirname, '..', 'reports', `qc-${projectId}.json`);
  if (fs.existsSync(qcPath)) {
    const qc = JSON.parse(fs.readFileSync(qcPath, 'utf8'));
    
    let allPass = true;
    
    for (const phase of ['pre_cnc', 'pre_instalacion', 'entrega']) {
      if (qc.phases && qc.phases[phase]) {
        metrics.phase_status[phase].pass = qc.phases[phase].pass;
        metrics.phase_status[phase].high_fails = qc.phases[phase].high_fails || 0;
        
        if (qc.phases[phase].pass !== true) {
          allPass = false;
        }
      }
    }
    
    metrics.qc_overall_pass = allPass;
    
    if (qc.generated_at) timestamps.push(qc.generated_at);
  } else {
    warnings.push(`missing qc report`);
    metrics.qc_overall_pass = null;
  }
  
  // Load BOM
  const bomPath = path.join(projectDir, 'bom.json');
  if (fs.existsSync(bomPath)) {
    const bom = JSON.parse(fs.readFileSync(bomPath, 'utf8'));
    
    metrics.pieces_count = bom.pieces?.length || null;
    
    if (bom.hardware) {
      for (const [key, data] of Object.entries(bom.hardware)) {
        if (key.includes('guia')) {
          metrics.hardware.guias = data.count || null;
        }
        if (key.includes('bisagra')) {
          metrics.hardware.bisagras = data.count || null;
        }
      }
    }
    
    if (bom.generated_at) timestamps.push(bom.generated_at);
  } else {
    warnings.push(`missing bom`);
  }
  
  // Get most recent timestamp
  if (timestamps.length > 0) {
    timestamps.sort((a, b) => new Date(b) - new Date(a));
    metrics.generated_at = timestamps[0];
  } else {
    metrics.generated_at = new Date().toISOString();
  }
  
  return { metrics, warnings };
}

// Update history
function updateHistory(metrics) {
  const historyPath = path.join(__dirname, '..', 'public', 'api', 'ops', 'history.json');
  
  let history = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  // Create snapshot
  const snapshot = {
    date: today,
    projectId: metrics.projectId,
    cost_p50: metrics.cost_p50,
    cost_p80: metrics.cost_p80,
    waste_pct: metrics.waste_pct,
    qc_overall_pass: metrics.qc_overall_pass
  };
  
  // Find existing entry for this project+date
  const existingIndex = history.findIndex(h => 
    h.projectId === metrics.projectId && h.date === today
  );
  
  if (existingIndex >= 0) {
    history[existingIndex] = snapshot;
  } else {
    history.push(snapshot);
  }
  
  // Keep max 60 entries per project
  const projectHistory = {};
  for (const entry of history) {
    if (!projectHistory[entry.projectId]) {
      projectHistory[entry.projectId] = [];
    }
    projectHistory[entry.projectId].push(entry);
  }
  
  const trimmedHistory = [];
  for (const [projectId, entries] of Object.entries(projectHistory)) {
    // Sort by date descending and keep latest 60
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    trimmedHistory.push(...entries.slice(0, 60));
  }
  
  return trimmedHistory;
}

// Main execution
function main() {
  console.log(`${colors.blue}${colors.bold}Preparing ops dashboard data...${colors.reset}`);
  
  // Create output directories
  const opsDir = path.join(__dirname, '..', 'public', 'api', 'ops');
  const projectsDir = path.join(opsDir, 'projects');
  
  if (!fs.existsSync(opsDir)) {
    fs.mkdirSync(opsDir, { recursive: true });
  }
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  
  // Process all projects
  const projectsPath = path.join(__dirname, '..', 'data', 'projects');
  const projectDirs = fs.readdirSync(projectsPath).filter(dir => {
    return fs.statSync(path.join(projectsPath, dir)).isDirectory();
  });
  
  const summary = [];
  const allHistory = [];
  let okCount = 0;
  let blockedCount = 0;
  let missingCount = 0;
  
  for (const projectId of projectDirs) {
    const { metrics, warnings } = processProject(projectId);
    
    // Save detailed project data
    const projectDataPath = path.join(projectsDir, `${projectId}.json`);
    fs.writeFileSync(projectDataPath, JSON.stringify(metrics, null, 2));
    
    // Create summary entry
    const summaryEntry = {
      projectId: metrics.projectId,
      cliente: metrics.cliente,
      cost_p50: metrics.cost_p50,
      cost_p80: metrics.cost_p80,
      timeline_days_p50: metrics.timeline_days_p50,
      sheets_used: metrics.sheets_used,
      waste_pct: metrics.waste_pct,
      qc_overall_pass: metrics.qc_overall_pass,
      pieces_count: metrics.pieces_count,
      generated_at: metrics.generated_at
    };
    
    summary.push(summaryEntry);
    
    // Update history
    const updatedHistory = updateHistory(metrics);
    allHistory.push(...updatedHistory);
    
    // Count status
    if (metrics.qc_overall_pass === true) {
      okCount++;
    } else if (metrics.qc_overall_pass === false) {
      blockedCount++;
    } else {
      missingCount++;
    }
    
    // Log warnings
    if (warnings.length > 0) {
      console.log(`${colors.yellow}⚠️  OpsPrepare: ${projectId} ${warnings.join(', ')} (skipping affected metrics)${colors.reset}`);
    }
  }
  
  // Save summary
  const summaryPath = path.join(opsDir, 'index.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  
  // Save history (deduplicated)
  const uniqueHistory = [];
  const seen = new Set();
  
  for (const entry of allHistory) {
    const key = `${entry.projectId}-${entry.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueHistory.push(entry);
    }
  }
  
  const historyPath = path.join(opsDir, 'history.json');
  fs.writeFileSync(historyPath, JSON.stringify(uniqueHistory, null, 2));
  
  console.log(`${colors.cyan}📊 OpsPrepare: ${projectDirs.length} project(s) → OK:${okCount} | BLOCKED:${blockedCount} | Missing:${missingCount}${colors.reset}`);
  console.log(`${colors.green}${colors.bold}✅ Ops preparation complete${colors.reset}`);
}

main();