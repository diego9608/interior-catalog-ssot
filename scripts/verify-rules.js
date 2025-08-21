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
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

// Load catalogs into memory
const catalogs = {};
let errorCount = 0;
let highSeverityFails = 0;

function loadCatalogs() {
  const catalogTypes = ['materials', 'hardware', 'adhesives', 'vendors'];
  
  for (const type of catalogTypes) {
    catalogs[type] = {};
    const catalogDir = path.join(__dirname, '..', 'data', 'catalog', type);
    
    if (!fs.existsSync(catalogDir)) continue;
    
    const files = fs.readdirSync(catalogDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const content = JSON.parse(fs.readFileSync(path.join(catalogDir, file), 'utf8'));
      if (content.id) {
        catalogs[type][content.id] = content;
      }
    }
  }
}

function loadRules() {
  const rulesPath = path.join(__dirname, '..', 'data', 'catalog', 'rules', 'rules.core.yaml');
  
  if (!fs.existsSync(rulesPath)) {
    console.error(`${colors.red}Rules file not found: ${rulesPath}${colors.reset}`);
    process.exit(1);
  }
  
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const parsed = yaml.parse(rulesContent);
  return parsed.rules || [];
}

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  
  return current;
}

function evaluateApplies(applies, intake, catalogs) {
  if (!applies) return true;
  
  // Handle 'equals' condition
  if (applies.equals) {
    const value = getNestedValue(intake, applies.equals.path);
    return value === applies.equals.value;
  }
  
  // Handle 'exists' condition
  if (applies.exists) {
    const value = getNestedValue(intake, applies.exists.path);
    return value !== undefined && value !== null;
  }
  
  // Handle 'some_in_list_catalog' condition
  if (applies.some_in_list_catalog) {
    const list = getNestedValue(intake, applies.some_in_list_catalog.path);
    if (!Array.isArray(list)) return false;
    
    const catalog = catalogs[applies.some_in_list_catalog.catalog];
    if (!catalog) return false;
    
    return list.some(itemId => {
      const item = catalog[itemId];
      if (!item) return false;
      
      const filter = applies.some_in_list_catalog.filter;
      if (filter && filter.prop && filter.equals) {
        return item[filter.prop] === filter.equals;
      }
      return true;
    });
  }
  
  return true;
}

function evaluateCheck(check, intake, catalogs) {
  const result = {
    pass: false,
    actual: null,
    expected: null
  };
  
  // Handle 'range' check
  if (check.type === 'range') {
    const value = getNestedValue(intake, check.path);
    result.actual = value;
    result.expected = `${check.min}–${check.max}`;
    
    if (value === undefined || value === null) {
      result.pass = false;
      result.actual = 'undefined';
    } else {
      result.pass = value >= check.min && value <= check.max;
    }
  }
  
  // Handle 'catalog_prop_equals' check
  if (check.type === 'catalog_prop_equals') {
    const itemId = getNestedValue(intake, check.from.path);
    const catalog = catalogs[check.from.catalog];
    
    if (!itemId) {
      result.actual = 'undefined';
      result.expected = check.equals;
      result.pass = false;
    } else if (!catalog || !catalog[itemId]) {
      result.actual = `${itemId} not found in catalog`;
      result.expected = check.equals;
      result.pass = false;
    } else {
      const item = catalog[itemId];
      const propValue = item[check.from.prop];
      result.actual = propValue;
      result.expected = check.equals;
      result.pass = propValue === check.equals;
    }
  }
  
  // Handle 'list_catalog_min' check
  if (check.type === 'list_catalog_min') {
    const list = getNestedValue(intake, check.path);
    const catalog = catalogs[check.catalog];
    
    if (!Array.isArray(list)) {
      result.actual = 'not a list';
      result.expected = `mins: ${JSON.stringify(check.mins)}`;
      result.pass = false;
    } else if (!catalog) {
      result.actual = 'catalog not found';
      result.expected = `mins: ${JSON.stringify(check.mins)}`;
      result.pass = false;
    } else {
      // Filter items by where clause
      const relevantItems = list.filter(itemId => {
        const item = catalog[itemId];
        if (!item) return false;
        
        if (check.where && check.where.prop && check.where.equals) {
          return item[check.where.prop] === check.where.equals;
        }
        return true;
      });
      
      if (relevantItems.length === 0) {
        result.actual = 'no matching items in list';
        result.expected = `mins: ${JSON.stringify(check.mins)}`;
        result.pass = true; // No items to check, so technically passes
      } else {
        // Check if all relevant items meet minimum requirements
        const failures = [];
        for (const itemId of relevantItems) {
          const item = catalog[itemId];
          if (!item) continue;
          
          for (const [prop, minValue] of Object.entries(check.mins)) {
            if (item[prop] < minValue) {
              failures.push(`${itemId}.${prop}=${item[prop]} < ${minValue}`);
            }
          }
        }
        
        result.pass = failures.length === 0;
        result.actual = failures.length > 0 ? failures.join(', ') : 'all meet mins';
        result.expected = `mins: ${JSON.stringify(check.mins)}`;
      }
    }
  }
  
  return result;
}

function processProject(projectDir, rules, catalogs) {
  const intakePath = path.join(projectDir, 'intake.json');
  const projectId = path.basename(projectDir);
  
  if (!fs.existsSync(intakePath)) {
    console.log(`${colors.gray}Skipping ${projectId}: no intake.json${colors.reset}`);
    return null;
  }
  
  const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
  const report = {
    projectId,
    timestamp: new Date().toISOString(),
    results: []
  };
  
  console.log(`\n${colors.blue}${colors.bold}Evaluating project: ${projectId}${colors.reset}`);
  console.log(`${colors.gray}${'─'.repeat(50)}${colors.reset}`);
  
  for (const rule of rules) {
    // Check if rule applies
    if (!evaluateApplies(rule.applies, intake, catalogs)) {
      continue; // Rule doesn't apply to this project
    }
    
    // Evaluate the check
    const checkResult = evaluateCheck(rule.check, intake, catalogs);
    
    const result = {
      ruleId: rule.id,
      domain: rule.domain,
      severity: rule.severity,
      desc: rule.desc,
      pass: checkResult.pass,
      actual: checkResult.actual,
      expected: checkResult.expected,
      guidance: rule.check.guidance,
      path: rule.check.path || rule.check.from?.path
    };
    
    report.results.push(result);
    
    // Print result
    if (result.pass) {
      console.log(`${colors.green}✅ PASS: ${rule.id} ${rule.desc}${colors.reset}`);
    } else if (rule.severity === 'high') {
      const errorCode = `E-RULE-H-${rule.id.split('-')[1]}`;
      console.log(`${colors.red}❌ FAIL: ${errorCode} ${rule.id} ${rule.desc}${colors.reset}`);
      console.log(`${colors.red}   Actual: ${result.actual}${colors.reset}`);
      console.log(`${colors.red}   Expected: ${result.expected}${colors.reset}`);
      console.log(`${colors.gray}   Guidance: ${result.guidance}${colors.reset}`);
      highSeverityFails++;
      errorCount++;
    } else if (rule.severity === 'medium') {
      const errorCode = `E-RULE-M-${rule.id.split('-')[1]}`;
      console.log(`${colors.yellow}⚠️  WARN: ${errorCode} ${rule.id} ${rule.desc}${colors.reset}`);
      console.log(`${colors.yellow}   Actual: ${result.actual}${colors.reset}`);
      console.log(`${colors.yellow}   Expected: ${result.expected}${colors.reset}`);
      console.log(`${colors.gray}   Guidance: ${result.guidance}${colors.reset}`);
      errorCount++;
    } else if (rule.severity === 'low') {
      const errorCode = `E-RULE-L-${rule.id.split('-')[1]}`;
      console.log(`${colors.blue}ℹ️  INFO: ${errorCode} ${rule.id} ${rule.desc}${colors.reset}`);
      console.log(`${colors.blue}   Actual: ${result.actual}${colors.reset}`);
      console.log(`${colors.blue}   Expected: ${result.expected}${colors.reset}`);
      console.log(`${colors.gray}   Guidance: ${result.guidance}${colors.reset}`);
    }
  }
  
  return report;
}

function saveReport(report) {
  const reportsDir = path.join(__dirname, '..', 'reports');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const reportPath = path.join(reportsDir, `rules-${report.projectId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`${colors.gray}Report saved: reports/rules-${report.projectId}.json${colors.reset}`);
}

// Main execution
function main() {
  console.log(`${colors.blue}${colors.bold}Loading catalogs and rules...${colors.reset}`);
  
  loadCatalogs();
  const rules = loadRules();
  
  console.log(`${colors.gray}Loaded ${rules.length} rules${colors.reset}`);
  console.log(`${colors.gray}Loaded catalogs: ${Object.keys(catalogs).map(k => `${k}(${Object.keys(catalogs[k]).length})`).join(', ')}${colors.reset}`);
  
  // Process all projects
  const projectsDir = path.join(__dirname, '..', 'data', 'projects');
  const projects = fs.readdirSync(projectsDir).filter(dir => {
    return fs.statSync(path.join(projectsDir, dir)).isDirectory();
  });
  
  const reports = [];
  
  for (const project of projects) {
    const projectDir = path.join(projectsDir, project);
    const report = processProject(projectDir, rules, catalogs);
    
    if (report) {
      reports.push(report);
      saveReport(report);
    }
  }
  
  // Summary
  console.log(`\n${colors.blue}${colors.bold}${'═'.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}Rules Verification Summary${colors.reset}`);
  console.log(`${colors.blue}${'═'.repeat(50)}${colors.reset}`);
  console.log(`Projects evaluated: ${reports.length}`);
  console.log(`Total issues: ${errorCount}`);
  console.log(`High severity failures: ${highSeverityFails}`);
  
  if (highSeverityFails > 0) {
    console.log(`\n${colors.red}${colors.bold}❌ Build blocked: ${highSeverityFails} high severity rule(s) failed${colors.reset}`);
    process.exit(1);
  } else if (errorCount > 0) {
    console.log(`\n${colors.yellow}${colors.bold}⚠️  Build allowed with ${errorCount} warning(s)${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.green}${colors.bold}✅ All rules passed${colors.reset}`);
    process.exit(0);
  }
}

main();