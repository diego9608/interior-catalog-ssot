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

// Load all pricing catalogs
function loadPricingCatalogs() {
  const pricingDir = path.join(__dirname, '..', 'data', 'catalog', 'pricing');
  const pricing = {};
  
  const files = [
    'materials.encimeras.json',
    'paneles.tableros.json',
    'hardware.json',
    'labor.json',
    'overheads.json',
    'costs.config.json'
  ];
  
  for (const file of files) {
    const filePath = path.join(pricingDir, file);
    if (fs.existsSync(filePath)) {
      const key = file.replace('.json', '').replace('.', '_');
      pricing[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      console.error(`${colors.yellow}Warning: Pricing file not found: ${file}${colors.reset}`);
    }
  }
  
  return pricing;
}

// Load material catalogs
function loadMaterialsCatalog() {
  const materialsDir = path.join(__dirname, '..', 'data', 'catalog', 'materials');
  const materials = {};
  
  if (!fs.existsSync(materialsDir)) return materials;
  
  const files = fs.readdirSync(materialsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(materialsDir, file), 'utf8'));
    if (content.id) {
      materials[content.id] = content;
    }
  }
  
  return materials;
}

// Load vendors catalog
function loadVendorsCatalog() {
  const vendorsDir = path.join(__dirname, '..', 'data', 'catalog', 'vendors');
  const vendors = {};
  
  if (!fs.existsSync(vendorsDir)) return vendors;
  
  const files = fs.readdirSync(vendorsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(vendorsDir, file), 'utf8'));
    if (content.id) {
      vendors[content.id] = content;
    }
  }
  
  return vendors;
}

// Format number with thousand separators
function formatNumber(num) {
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Calculate costs for a project
function calculateProjectCosts(projectDir, pricing, materials, vendors) {
  const intakePath = path.join(projectDir, 'intake.json');
  const projectId = path.basename(projectDir);
  
  if (!fs.existsSync(intakePath)) {
    console.log(`${colors.gray}Skipping ${projectId}: no intake.json${colors.reset}`);
    return null;
  }
  
  const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
  const warnings = [];
  
  // Validate minimum requirements
  if (!intake.especificaciones?.encimera) {
    warnings.push('Missing especificaciones.encimera');
  }
  if (!intake.especificaciones?.frentes) {
    warnings.push('Missing especificaciones.frentes');
  }
  if (!intake.scope) {
    warnings.push('Missing scope section');
    return null;
  }
  
  const scope = intake.scope;
  const specs = intake.especificaciones || {};
  
  // Initialize breakdown
  const breakdown = {
    encimera: { area_m2: 0, price_m2: 0, waste_pct: 0, cost: 0 },
    paneles: { area_m2: 0, price_m2: 0, waste_pct: 0, cost: 0 },
    hardware: { guias: { count: 0, price: 0, cost: 0 }, bisagras: { count: 0, price: 0, cost: 0 }, total: 0 },
    consumibles: { pct: 0, cost: 0 },
    labor: { install_hours: 0, cnc_hours: 0, finishing_hours: 0, cost: 0 }
  };
  
  // 1. Calculate encimera (countertop)
  if (specs.encimera && scope.cubierta_m2) {
    const encimeraPrice = pricing.materials_encimeras?.items?.[specs.encimera];
    if (encimeraPrice) {
      breakdown.encimera.area_m2 = scope.cubierta_m2;
      breakdown.encimera.price_m2 = encimeraPrice.price_m2;
      breakdown.encimera.waste_pct = encimeraPrice.waste_factor_pct;
      breakdown.encimera.cost = encimeraPrice.price_m2 * scope.cubierta_m2 * (1 + encimeraPrice.waste_factor_pct);
    } else {
      warnings.push(`E-COST-002 Price not found for ${specs.encimera} in materials.encimeras.json`);
    }
  }
  
  // 2. Calculate paneles (panels) - heuristic first
  let panel_cost_heuristic = 0;
  let panel_area_heuristic = 0;
  
  if (specs.frentes) {
    const panelPrice = pricing.paneles_tableros?.items?.[specs.frentes];
    const coeffs = pricing.paneles_tableros?.coefficients || {};
    
    if (panelPrice) {
      panel_area_heuristic = (scope.lineales_base_ml || 0) * (coeffs.panel_area_m2_per_ml_base || 1.2) +
                            (scope.lineales_altos_ml || 0) * (coeffs.panel_area_m2_per_ml_altos || 0.8);
      
      panel_cost_heuristic = panelPrice.price_m2 * panel_area_heuristic * (1 + panelPrice.waste_factor_pct);
      
      // Initialize breakdown with heuristic values
      breakdown.paneles = {
        heuristic: {
          area_m2: panel_area_heuristic,
          waste_pct_pricing: panelPrice.waste_factor_pct,
          cost: panel_cost_heuristic
        },
        override_real: {
          enabled: false,
          materials: {},
          cost_total: 0,
          delta_vs_heuristic: 0,
          naive_baseline_cost: 0,
          optimization_savings_vs_naive: 0
        }
      };
    } else {
      warnings.push(`E-COST-002 Price not found for ${specs.frentes} in paneles.tableros.json`);
      breakdown.paneles = {
        heuristic: { area_m2: 0, waste_pct_pricing: 0, cost: 0 },
        override_real: {
          enabled: false,
          materials: {},
          cost_total: 0,
          delta_vs_heuristic: 0,
          naive_baseline_cost: 0,
          optimization_savings_vs_naive: 0
        }
      };
    }
  }
  
  // Check for cost override with cuts report
  const costsConfig = pricing.costs_config || {};
  const use_cut_merma_override = costsConfig.use_cut_merma_override || false;
  const optimization_baseline_waste_pct = costsConfig.optimization_baseline_waste_pct || 0.35;
  const apply_salvage_credit = costsConfig.apply_salvage_credit || false;
  const salvage_credit_pct = costsConfig.salvage_credit_pct || 0.20;
  
  if (use_cut_merma_override) {
    const cutsReportPath = path.join(__dirname, '..', 'reports', `cuts-${projectId}.json`);
    
    if (fs.existsSync(cutsReportPath)) {
      const cutsReport = JSON.parse(fs.readFileSync(cutsReportPath, 'utf8'));
      
      if (cutsReport.material_sheets) {
        breakdown.paneles.override_real.enabled = true;
        let panel_cost_real_total = 0;
        let naive_cost_total = 0;
        
        for (const [material, materialData] of Object.entries(cutsReport.material_sheets)) {
          const materialPrice = pricing.paneles_tableros?.items?.[material];
          
          if (materialPrice) {
            const sheet_area_m2 = materialData.sheet_area_m2;
            const sheets_used = materialData.sheets_used;
            const pieces_area_m2 = materialData.pieces_area_m2;
            const waste_pct_real = materialData.waste_pct;
            const price_m2 = materialPrice.price_m2;
            
            // Calculate real cost for this material
            let material_cost = price_m2 * sheet_area_m2 * sheets_used;
            
            // Apply salvage credit if enabled
            let salvage_credit = 0;
            if (apply_salvage_credit && materialData.offcuts && Array.isArray(materialData.offcuts)) {
              let offcuts_area_m2 = 0;
              for (const offcut of materialData.offcuts) {
                offcuts_area_m2 += (offcut.w * offcut.h) / 1e6;
              }
              salvage_credit = offcuts_area_m2 * price_m2 * salvage_credit_pct;
              material_cost -= salvage_credit;
            }
            
            // Calculate naive baseline cost
            const naive_required_area = pieces_area_m2 / (1 - optimization_baseline_waste_pct);
            const naive_cost = naive_required_area * price_m2;
            
            breakdown.paneles.override_real.materials[material] = {
              sheet_area_m2,
              sheets_used,
              pieces_area_m2,
              waste_pct_real,
              price_m2,
              cost: material_cost,
              salvage_credit_applied: apply_salvage_credit,
              salvage_credit
            };
            
            panel_cost_real_total += material_cost;
            naive_cost_total += naive_cost;
          }
        }
        
        breakdown.paneles.override_real.cost_total = panel_cost_real_total;
        breakdown.paneles.override_real.delta_vs_heuristic = panel_cost_real_total - panel_cost_heuristic;
        breakdown.paneles.override_real.naive_baseline_cost = naive_cost_total;
        breakdown.paneles.override_real.optimization_savings_vs_naive = naive_cost_total - panel_cost_real_total;
      }
    }
  }
  
  // 3. Calculate hardware
  if (specs.herrajes_estandar && Array.isArray(specs.herrajes_estandar)) {
    const hardwarePricing = pricing.hardware || {};
    const assumptions = hardwarePricing.assumptions || {};
    
    // Find guias and bisagras
    const hasGuia = specs.herrajes_estandar.find(h => h.includes('guia'));
    const hasBisagra = specs.herrajes_estandar.find(h => h.includes('bisagra'));
    
    if (hasGuia && scope.cajones_unidades) {
      const guiaPrice = hardwarePricing.items?.[hasGuia];
      if (guiaPrice) {
        breakdown.hardware.guias.count = scope.cajones_unidades;
        breakdown.hardware.guias.price = guiaPrice.price_unit;
        breakdown.hardware.guias.cost = guiaPrice.price_unit * scope.cajones_unidades;
      } else {
        warnings.push(`E-COST-002 Price not found for ${hasGuia} in hardware.json`);
      }
    }
    
    if (hasBisagra && scope.puertas_unidades) {
      const bisagraPrice = hardwarePricing.items?.[hasBisagra];
      if (bisagraPrice) {
        const bisagrasCount = scope.puertas_unidades * (assumptions.bisagras_por_puerta || 2);
        breakdown.hardware.bisagras.count = bisagrasCount;
        breakdown.hardware.bisagras.price = bisagraPrice.price_unit;
        breakdown.hardware.bisagras.cost = bisagraPrice.price_unit * bisagrasCount;
      } else {
        warnings.push(`E-COST-002 Price not found for ${hasBisagra} in hardware.json`);
      }
    }
    
    breakdown.hardware.total = breakdown.hardware.guias.cost + breakdown.hardware.bisagras.cost;
  }
  
  // 4. Calculate consumibles
  const overheads = pricing.overheads || {};
  // Use real panel cost if override is enabled
  const panel_cost_for_calc = breakdown.paneles.override_real.enabled ? 
    breakdown.paneles.override_real.cost_total : 
    (breakdown.paneles.heuristic ? breakdown.paneles.heuristic.cost : 0);
  
  const materials_subtotal = breakdown.encimera.cost + panel_cost_for_calc + breakdown.hardware.total;
  breakdown.consumibles.pct = overheads.consumibles_pct || 0.03;
  breakdown.consumibles.cost = materials_subtotal * breakdown.consumibles.pct;
  
  // 5. Calculate labor
  const labor = pricing.labor || {};
  const laborRates = labor.rates_hr || {};
  const laborCoeffs = labor.coefficients || {};
  const crew = labor.crew || {};
  
  // Installation hours
  const install_hours = (scope.lineales_base_ml || 0) * (laborCoeffs.install_hours_per_ml_base || 0.9) +
                       (scope.lineales_altos_ml || 0) * (laborCoeffs.install_hours_per_ml_altos || 0.7) +
                       (scope.cubierta_m2 || 0) * (laborCoeffs.install_hours_per_m2_counter || 0.6);
  
  breakdown.labor.install_hours = install_hours;
  const install_cost = install_hours * (laborRates.instalacion || 350);
  
  // CNC hours - use heuristic area for labor calculation
  const panel_area_for_labor = breakdown.paneles.heuristic ? breakdown.paneles.heuristic.area_m2 : 0;
  const cnc_hours = panel_area_for_labor * (laborCoeffs.cnc_hours_per_m2_panel || 0.4);
  breakdown.labor.cnc_hours = cnc_hours;
  const cnc_cost = cnc_hours * (laborRates.cnc || 420);
  
  // Finishing hours (depends on material) - use heuristic area for labor calculation
  let finishing_hours = 0;
  if (specs.frentes === 'mat.madera.chapada_roble') {
    finishing_hours = panel_area_for_labor * (laborCoeffs.finishing_hours_per_m2_panel_madera_chapada || 0.5);
  } else if (specs.frentes === 'mat.melamina.mdf18_mr') {
    finishing_hours = panel_area_for_labor * (laborCoeffs.finishing_hours_per_m2_panel_melamina || 0);
  }
  breakdown.labor.finishing_hours = finishing_hours;
  const finishing_cost = finishing_hours * (laborRates.acabados || 380);
  
  breakdown.labor.cost = install_cost + cnc_cost + finishing_cost;
  
  // 6. Calculate totals - use real panel cost if override is enabled
  const materials_total = breakdown.encimera.cost + panel_cost_for_calc + breakdown.hardware.total;
  const direct_total = materials_total + breakdown.consumibles.cost + breakdown.labor.cost;
  const p50 = direct_total * (1 + (overheads.overhead_pct || 0.10) + (overheads.profit_pct || 0.15));
  const p80 = p50 * (1 + (overheads.risk_p80_pct || 0.07));
  
  // 7. Calculate timeline
  let lead_time_dias = 10; // default
  if (intake.proveedor_principal && vendors[intake.proveedor_principal]) {
    lead_time_dias = vendors[intake.proveedor_principal].lead_time_dias || 10;
  }
  
  const cnc_days = cnc_hours / (crew.cnc_effective_hours_per_day || 6);
  const install_days = install_hours / ((crew.install_team_size || 2) * (crew.hours_per_day || 8));
  const fabrication_buffer = overheads.timeline?.fabrication_buffer_days || 1;
  
  const timeline_p50 = Math.max(lead_time_dias, cnc_days + fabrication_buffer) + install_days;
  const timeline_p80 = timeline_p50 * (1 + (overheads.timeline?.risk_p80_pct || 0.15));
  
  // Build report
  const report = {
    projectId,
    currency: 'MXN',
    inputs: {
      scope,
      materials: {
        encimera: specs.encimera,
        frentes: specs.frentes
      },
      hardware: specs.herrajes_estandar || []
    },
    breakdown,
    totals: {
      materials: parseFloat(materials_total.toFixed(2)),
      direct: parseFloat(direct_total.toFixed(2)),
      p50: parseFloat(p50.toFixed(2)),
      p80: parseFloat(p80.toFixed(2))
    },
    timeline_days: {
      p50: parseFloat(timeline_p50.toFixed(2)),
      p80: parseFloat(timeline_p80.toFixed(2)),
      lead_time: lead_time_dias,
      cnc: parseFloat(cnc_days.toFixed(2)),
      install: parseFloat(install_days.toFixed(2)),
      crew_size_install: crew.install_team_size || 2
    },
    warnings
  };
  
  // Round all numeric values in breakdown
  for (const key in breakdown) {
    if (typeof breakdown[key] === 'object') {
      for (const subkey in breakdown[key]) {
        if (typeof breakdown[key][subkey] === 'number') {
          breakdown[key][subkey] = parseFloat(breakdown[key][subkey].toFixed(2));
        }
      }
    }
  }
  
  return report;
}

// Save report as JSON
function saveJsonReport(report) {
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // Create clean report structure for JSON output
  const jsonReport = JSON.parse(JSON.stringify(report));
  
  // Ensure all numeric values are properly rounded
  const roundObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'number') {
        obj[key] = parseFloat(obj[key].toFixed(2));
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        roundObject(obj[key]);
      }
    }
  };
  
  roundObject(jsonReport);
  
  const reportPath = path.join(reportsDir, `costs-${report.projectId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(jsonReport, null, 2));
  
  console.log(`${colors.gray}JSON report saved: reports/costs-${report.projectId}.json${colors.reset}`);
}

// Save report as Markdown
function saveMarkdownReport(report) {
  const reportsDir = path.join(__dirname, '..', 'reports');
  
  let md = `# Reporte de Costos - ${report.projectId}\n\n`;
  md += `**Fecha:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Moneda:** ${report.currency}\n\n`;
  
  md += `## Resumen de Costos\n\n`;
  md += `| Concepto | Monto (${report.currency}) |\n`;
  md += `|----------|----------|\n`;
  md += `| Materiales | ${formatNumber(report.totals.materials)} |\n`;
  md += `| Costo Directo | ${formatNumber(report.totals.direct)} |\n`;
  md += `| **P50** | **${formatNumber(report.totals.p50)}** |\n`;
  md += `| **P80** | **${formatNumber(report.totals.p80)}** |\n\n`;
  
  md += `## Desglose de Materiales\n\n`;
  md += `| Concepto | Área/Cantidad | Precio Unit. | Merma | Costo |\n`;
  md += `|----------|---------------|--------------|-------|-------|\n`;
  md += `| Encimera | ${report.breakdown.encimera.area_m2} m² | ${formatNumber(report.breakdown.encimera.price_m2)} | ${(report.breakdown.encimera.waste_pct * 100).toFixed(0)}% | ${formatNumber(report.breakdown.encimera.cost)} |\n`;
  
  // Handle panels with override information
  if (report.breakdown.paneles?.override_real?.enabled) {
    const override = report.breakdown.paneles.override_real;
    let panelCostDisplay = formatNumber(override.cost_total);
    if (override.delta_vs_heuristic !== 0) {
      const deltaSign = override.delta_vs_heuristic >= 0 ? '+' : '';
      panelCostDisplay += ` (Δ${deltaSign}${formatNumber(override.delta_vs_heuristic)})`;
    }
    // Show real waste percentage from cuts
    let wasteDisplay = '-';
    if (override.materials) {
      const firstMaterial = Object.values(override.materials)[0];
      if (firstMaterial && firstMaterial.waste_pct_real !== undefined) {
        wasteDisplay = `${(firstMaterial.waste_pct_real * 100).toFixed(0)}%`;
      }
    }
    md += `| Paneles* | - | - | ${wasteDisplay} | ${panelCostDisplay} |\n`;
  } else if (report.breakdown.paneles?.heuristic) {
    const heuristic = report.breakdown.paneles.heuristic;
    md += `| Paneles | ${heuristic.area_m2} m² | - | ${(heuristic.waste_pct_pricing * 100).toFixed(0)}% | ${formatNumber(heuristic.cost)} |\n`;
  }
  
  md += `| Guías | ${report.breakdown.hardware.guias.count} u | ${formatNumber(report.breakdown.hardware.guias.price)} | - | ${formatNumber(report.breakdown.hardware.guias.cost)} |\n`;
  md += `| Bisagras | ${report.breakdown.hardware.bisagras.count} u | ${formatNumber(report.breakdown.hardware.bisagras.price)} | - | ${formatNumber(report.breakdown.hardware.bisagras.cost)} |\n\n`;
  
  // Add panel override details if enabled
  if (report.breakdown.paneles?.override_real?.enabled) {
    md += `\n*_Paneles calculados con merma real del optimizador de corte_\n\n`;
  }
  
  md += `## Mano de Obra\n\n`;
  md += `| Concepto | Horas | Costo |\n`;
  md += `|----------|-------|-------|\n`;
  md += `| Instalación | ${report.breakdown.labor.install_hours.toFixed(2)} | ${formatNumber(report.breakdown.labor.install_hours * 350)} |\n`;
  md += `| CNC | ${report.breakdown.labor.cnc_hours.toFixed(2)} | ${formatNumber(report.breakdown.labor.cnc_hours * 420)} |\n`;
  md += `| Acabados | ${report.breakdown.labor.finishing_hours.toFixed(2)} | ${formatNumber(report.breakdown.labor.finishing_hours * 380)} |\n`;
  md += `| **Total** | **${(report.breakdown.labor.install_hours + report.breakdown.labor.cnc_hours + report.breakdown.labor.finishing_hours).toFixed(2)}** | **${formatNumber(report.breakdown.labor.cost)}** |\n\n`;
  
  md += `## Cronograma\n\n`;
  md += `| Concepto | Días |\n`;
  md += `|----------|------|\n`;
  md += `| Lead Time Materiales | ${report.timeline_days.lead_time} |\n`;
  md += `| CNC | ${report.timeline_days.cnc.toFixed(2)} |\n`;
  md += `| Instalación | ${report.timeline_days.install.toFixed(2)} |\n`;
  md += `| **P50** | **${report.timeline_days.p50.toFixed(2)}** |\n`;
  md += `| **P80** | **${report.timeline_days.p80.toFixed(2)}** |\n\n`;
  
  // Add cost adjustment section if override is enabled
  if (report.breakdown.paneles?.override_real?.enabled) {
    const override = report.breakdown.paneles.override_real;
    md += `## Ajuste por Merma Real\n\n`;
    md += `| Concepto | Valor |\n`;
    md += `|----------|-------|\n`;
    
    // Show details for each material
    for (const [material, data] of Object.entries(override.materials)) {
      md += `| ${material} - Hojas usadas | ${data.sheets_used} |\n`;
      md += `| ${material} - Merma real | ${(data.waste_pct_real * 100).toFixed(1)}% |\n`;
    }
    
    md += `| **Delta vs heurístico** | **${override.delta_vs_heuristic >= 0 ? '+' : ''}${formatNumber(override.delta_vs_heuristic)} ${report.currency}** |\n`;
    md += `| **Ahorro vs baseline** | **${formatNumber(override.optimization_savings_vs_naive)} ${report.currency}** |\n\n`;
  }
  
  if (report.warnings.length > 0) {
    md += `## Advertencias\n\n`;
    report.warnings.forEach(w => {
      md += `- ${w}\n`;
    });
  }
  
  const reportPath = path.join(reportsDir, `costs-${report.projectId}.md`);
  fs.writeFileSync(reportPath, md);
  
  console.log(`${colors.gray}Markdown report saved: reports/costs-${report.projectId}.md${colors.reset}`);
}

// Main execution
function main() {
  console.log(`${colors.blue}${colors.bold}Loading pricing catalogs...${colors.reset}`);
  
  const pricing = loadPricingCatalogs();
  const materials = loadMaterialsCatalog();
  const vendors = loadVendorsCatalog();
  
  console.log(`${colors.gray}Loaded pricing: ${Object.keys(pricing).join(', ')}${colors.reset}`);
  
  // Process all projects
  const projectsDir = path.join(__dirname, '..', 'data', 'projects');
  const projects = fs.readdirSync(projectsDir).filter(dir => {
    return fs.statSync(path.join(projectsDir, dir)).isDirectory();
  });
  
  console.log(`\n${colors.blue}${colors.bold}Calculating costs for ${projects.length} project(s)...${colors.reset}\n`);
  
  for (const project of projects) {
    const projectDir = path.join(projectsDir, project);
    const report = calculateProjectCosts(projectDir, pricing, materials, vendors);
    
    if (report) {
      // Save reports
      saveJsonReport(report);
      saveMarkdownReport(report);
      
      // Print summary
      console.log(`${colors.cyan}${colors.bold}Project: ${report.projectId}${colors.reset}`);
      console.log(`${colors.green}💰 P50: ${formatNumber(report.totals.p50)} ${report.currency} | P80: ${formatNumber(report.totals.p80)} ${report.currency}${colors.reset}`);
      console.log(`${colors.blue}🕒 Plazo P50: ${report.timeline_days.p50.toFixed(2)} días | P80: ${report.timeline_days.p80.toFixed(2)} días${colors.reset}`);
      
      // Show panel override status if enabled
      if (report.breakdown.paneles?.override_real?.enabled) {
        const delta = report.breakdown.paneles.override_real.delta_vs_heuristic;
        const savings = report.breakdown.paneles.override_real.optimization_savings_vs_naive;
        const deltaSign = delta >= 0 ? '+' : '';
        console.log(`${colors.cyan}🔁 Panels override: ON | Δ ${deltaSign}${formatNumber(delta)} ${report.currency} | Savings vs naive: ${formatNumber(savings)} ${report.currency}${colors.reset}`);
      }
      
      if (report.warnings.length > 0) {
        console.log(`${colors.yellow}⚠️  ${report.warnings.length} warning(s):${colors.reset}`);
        report.warnings.forEach(w => {
          console.log(`   ${colors.yellow}${w}${colors.reset}`);
        });
      }
      
      console.log('');
    }
  }
  
  console.log(`${colors.green}${colors.bold}✅ Cost calculation complete${colors.reset}`);
}

main();