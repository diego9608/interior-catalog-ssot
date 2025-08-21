const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

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

// Load QC checklists configuration
function loadChecklists() {
  const checklistPath = path.join(__dirname, '..', 'data', 'catalog', 'qc', 'checklists.core.yaml');
  if (!fs.existsSync(checklistPath)) {
    console.error(`${colors.red}E-APP-001: Missing checklists.core.yaml${colors.reset}`);
    return null;
  }
  const content = fs.readFileSync(checklistPath, 'utf8');
  return yaml.parse(content);
}

// Process a single project
function processProject(projectId) {
  const projectDir = path.join(__dirname, '..', 'data', 'projects', projectId);
  const intakePath = path.join(projectDir, 'intake.json');
  
  if (!fs.existsSync(intakePath)) {
    return null;
  }
  
  const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
  
  // Calculate automatic values
  const autoValues = {};
  
  // Calculate pieces.total_qty from pieces.csv
  const piecesPath = path.join(projectDir, 'pieces.csv');
  if (fs.existsSync(piecesPath)) {
    const pieces = parseCSV(piecesPath);
    autoValues['pieces.total_qty'] = pieces.reduce((sum, p) => {
      const qty = parseInt(p.qty) || 0;
      return sum + qty;
    }, 0);
  } else {
    autoValues['pieces.total_qty'] = null;
    console.log(`${colors.yellow}Warning: Missing pieces.csv for ${projectId}${colors.reset}`);
  }
  
  // Calculate cuts.placements_total from cuts report
  const cutsReportPath = path.join(__dirname, '..', 'reports', `cuts-${projectId}.json`);
  let cutsSummary = { sheets_used: 0, waste_pct: 0 };
  
  if (fs.existsSync(cutsReportPath)) {
    const cutsReport = JSON.parse(fs.readFileSync(cutsReportPath, 'utf8'));
    let placementsTotal = 0;
    
    if (cutsReport.material_sheets) {
      for (const [materialId, materialData] of Object.entries(cutsReport.material_sheets)) {
        if (materialData.placements) {
          placementsTotal += materialData.placements.length;
        }
        cutsSummary.sheets_used += materialData.sheets_used || 0;
        cutsSummary.waste_pct = materialData.waste_pct || 0;
      }
    }
    
    autoValues['cuts.placements_total'] = placementsTotal;
  } else {
    autoValues['cuts.placements_total'] = null;
    console.log(`${colors.yellow}Warning: Missing cuts report for ${projectId}${colors.reset}`);
  }
  
  return {
    id: projectId,
    cliente: intake.cliente || 'Cliente',
    phases: ['pre_cnc', 'pre_instalacion', 'entrega'],
    autoValues,
    cutsSummary
  };
}

// Generate checklists.json for a project
function generateChecklistsJson(projectId, autoValues, checklists) {
  const result = {
    projectId,
    auto: autoValues,
    phases: {}
  };
  
  if (!checklists) {
    return result;
  }
  
  // Process each phase
  for (const [phaseName, phaseConfig] of Object.entries(checklists.phases)) {
    result.phases[phaseName] = [];
    
    for (const item of phaseConfig.items) {
      const itemData = {
        id: item.id,
        desc: item.desc,
        type: item.type,
        severity: item.severity,
        evidence: item.evidence
      };
      
      // Add type-specific fields
      if (item.type === 'auto_eq') {
        itemData.left = item.left;
        itemData.right = item.right;
        itemData.left_value = autoValues[item.left];
        itemData.right_value = autoValues[item.right];
      } else if (item.type === 'number_range') {
        itemData.min = item.min;
        itemData.max = item.max;
        itemData.units = item.units;
      } else if (item.type === 'number_max') {
        itemData.max = item.max;
        itemData.units = item.units;
      }
      
      result.phases[phaseName].push(itemData);
    }
  }
  
  return result;
}

// Main execution
function main() {
  console.log(`${colors.blue}${colors.bold}Preparing app endpoints...${colors.reset}`);
  
  // Create public/api directory
  const apiDir = path.join(__dirname, '..', 'public', 'api');
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }
  
  // Load checklists
  const checklists = loadChecklists();
  
  // Process all projects
  const projectsDir = path.join(__dirname, '..', 'data', 'projects');
  const projectDirs = fs.readdirSync(projectsDir).filter(dir => {
    return fs.statSync(path.join(projectsDir, dir)).isDirectory();
  });
  
  const projects = [];
  
  for (const projectId of projectDirs) {
    const projectData = processProject(projectId);
    
    if (projectData) {
      // Add to projects list
      projects.push({
        id: projectData.id,
        cliente: projectData.cliente,
        phases: projectData.phases
      });
      
      // Create project API directory
      const projectApiDir = path.join(apiDir, projectId);
      if (!fs.existsSync(projectApiDir)) {
        fs.mkdirSync(projectApiDir, { recursive: true });
      }
      
      // Generate checklists.json
      const checklistsJson = generateChecklistsJson(projectId, projectData.autoValues, checklists);
      fs.writeFileSync(
        path.join(projectApiDir, 'checklists.json'),
        JSON.stringify(checklistsJson, null, 2)
      );
      
      // Generate meta.json
      const metaJson = {
        projectId: projectData.id,
        cliente: projectData.cliente,
        labels_hint: `data/projects/${projectId}/labels/`,
        cuts_summary: projectData.cutsSummary
      };
      fs.writeFileSync(
        path.join(projectApiDir, 'meta.json'),
        JSON.stringify(metaJson, null, 2)
      );
      
      console.log(`${colors.gray}Generated API for ${projectId}${colors.reset}`);
    }
  }
  
  // Save projects.json
  fs.writeFileSync(
    path.join(apiDir, 'projects.json'),
    JSON.stringify(projects, null, 2)
  );
  
  console.log(`${colors.cyan}📡 AppPrepare: exposed /public/api for ${projects.length} project(s) (${projects.map(p => p.id).join(', ')})${colors.reset}`);
  console.log(`${colors.green}${colors.bold}✅ App preparation complete${colors.reset}`);
}

main();