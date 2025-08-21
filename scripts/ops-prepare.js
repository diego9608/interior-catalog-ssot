const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// Get git SHA
function getGitSHA() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return process.env.COMMIT_REF || 'unknown';
  }
}

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
    generated_at: null,
    // Target metas (optional)
    target_cost_p50: null,
    target_waste_pct: null,
    target_timeline_days: null
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

// Create snapshot for a build
function createSnapshot(allMetrics, sha, generatedAt) {
  const snapshotsDir = path.join(__dirname, '..', 'public', 'api', 'ops', 'snapshots');
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  
  // Format timestamp for filename: YYYYMMDD-HHMMSS
  const timestamp = generatedAt.replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
  const snapshotPath = path.join(snapshotsDir, `${timestamp}_${sha}.json`);
  
  // Create snapshot data
  const snapshot = {
    generated_at: generatedAt,
    commit: sha,
    projects: allMetrics.map(m => ({
      projectId: m.projectId,
      cliente: m.cliente,
      generated_at: m.generated_at,
      commit: sha,
      cost_p50: m.cost_p50,
      cost_p80: m.cost_p80,
      timeline_days_p50: m.timeline_days_p50,
      waste_pct: m.waste_pct,
      sheets_used: m.sheets_used,
      pieces_count: m.pieces_count,
      qc_overall_pass: m.qc_overall_pass,
      target_cost_p50: m.target_cost_p50,
      target_waste_pct: m.target_waste_pct,
      target_timeline_days: m.target_timeline_days
    }))
  };
  
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  return snapshotPath;
}

// Update history.json
function updateHistory(allMetrics, sha, generatedAt) {
  const historyPath = path.join(__dirname, '..', 'public', 'api', 'ops', 'history.json');
  
  let history = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  }
  
  // Check if this SHA already exists
  const existingSHA = history.find(h => h.commit === sha);
  if (existingSHA) {
    console.log(`${colors.gray}History already contains SHA ${sha}, skipping${colors.reset}`);
    return history;
  }
  
  // Add new entry
  const newEntry = {
    generated_at: generatedAt,
    commit: sha,
    projects: allMetrics.map(m => ({
      projectId: m.projectId,
      cliente: m.cliente,
      cost_p50: m.cost_p50,
      cost_p80: m.cost_p80,
      timeline_days_p50: m.timeline_days_p50,
      waste_pct: m.waste_pct,
      qc_overall_pass: m.qc_overall_pass
    }))
  };
  
  history.push(newEntry);
  
  // Sort by date descending
  history.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
  
  // Keep max 365 days or 1000 entries
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 365);
  
  history = history.filter((entry, index) => {
    const entryDate = new Date(entry.generated_at);
    return index < 1000 && entryDate >= cutoffDate;
  });
  
  return history;
}

// Main execution
function main() {
  console.log(`${colors.blue}${colors.bold}Preparing ops dashboard data...${colors.reset}`);
  
  const sha = getGitSHA();
  const generatedAt = new Date().toISOString();
  
  console.log(`${colors.gray}Build: SHA=${sha}, Time=${generatedAt}${colors.reset}`);
  
  // Create output directories
  const opsDir = path.join(__dirname, '..', 'public', 'api', 'ops');
  const projectsDir = path.join(opsDir, 'projects');
  const snapshotsDir = path.join(opsDir, 'snapshots');
  
  if (!fs.existsSync(opsDir)) {
    fs.mkdirSync(opsDir, { recursive: true });
  }
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  
  // Process all projects
  const projectsPath = path.join(__dirname, '..', 'data', 'projects');
  const projectDirs = fs.readdirSync(projectsPath).filter(dir => {
    return fs.statSync(path.join(projectsPath, dir)).isDirectory();
  });
  
  const summary = [];
  const allMetrics = [];
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
    allMetrics.push(metrics);
    
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
  
  // Create snapshot for this build
  const snapshotPath = createSnapshot(allMetrics, sha, generatedAt);
  console.log(`${colors.cyan}📸 Created snapshot: ${path.basename(snapshotPath)}${colors.reset}`);
  
  // Update history.json
  const history = updateHistory(allMetrics, sha, generatedAt);
  const historyPath = path.join(opsDir, 'history.json');
  
  // Backfill initial history if empty
  if (history.length === 0 && summary.length > 0) {
    console.log(`${colors.yellow}Creating initial history from current data${colors.reset}`);
    const initialEntry = {
      generated_at: generatedAt,
      commit: 'seed',
      projects: summary.map(s => ({
        projectId: s.projectId,
        cliente: s.cliente,
        cost_p50: s.cost_p50,
        cost_p80: s.cost_p80,
        timeline_days_p50: s.timeline_days_p50,
        waste_pct: s.waste_pct,
        qc_overall_pass: s.qc_overall_pass
      }))
    };
    history.push(initialEntry);
  }
  
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  
  console.log(`${colors.cyan}📊 OpsPrepare: ${projectDirs.length} project(s) → OK:${okCount} | BLOCKED:${blockedCount} | Missing:${missingCount}${colors.reset}`);
  console.log(`${colors.cyan}📜 History: ${history.length} entries${colors.reset}`);
  
  // Save build metadata
  const metaPath = path.join(opsDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    date: generatedAt,
    sha: sha
  }, null, 2));
  
  console.log(`${colors.green}${colors.bold}✅ Ops preparation complete${colors.reset}`);
}

main();