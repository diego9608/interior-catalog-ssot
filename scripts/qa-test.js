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
  bold: '\x1b[1m'
};

// Quality thresholds
const LIGHTHOUSE_THRESHOLDS = {
  performance: 90,
  accessibility: 90,
  'best-practices': 90,
  seo: 90
};

const CRITICAL_A11Y_IMPACT = ['critical', 'serious'];

// Pages to test
const TEST_PAGES = [
  { url: 'public/index.html', name: 'Home' },
  { url: 'public/ops/index.html', name: 'Ops Dashboard' },
  { url: 'public/app/index.html', name: 'Field App' }
];

// Simple HTML validation
function validateHTML(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  // Check for basic HTML structure
  if (!html.includes('<!DOCTYPE html>')) {
    issues.push('Missing DOCTYPE declaration');
  }
  
  if (!html.includes('<html') || !html.includes('lang=')) {
    issues.push('Missing lang attribute on <html>');
  }
  
  if (!html.includes('<title>')) {
    issues.push('Missing <title> tag');
  }
  
  if (!html.includes('viewport')) {
    issues.push('Missing viewport meta tag');
  }
  
  // Check for alt attributes on images
  const imgRegex = /<img[^>]*>/g;
  const images = html.match(imgRegex) || [];
  images.forEach(img => {
    if (!img.includes('alt=')) {
      issues.push('Image missing alt attribute');
    }
  });
  
  // Check for proper heading hierarchy
  const headings = html.match(/<h[1-6][^>]*>/g) || [];
  let lastLevel = 0;
  headings.forEach(heading => {
    const level = parseInt(heading.charAt(2));
    if (level - lastLevel > 1 && lastLevel !== 0) {
      issues.push(`Heading hierarchy issue: h${lastLevel} → h${level}`);
    }
    lastLevel = level;
  });
  
  return issues;
}

// Check for accessibility issues
function checkAccessibility(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  // Check for ARIA labels on interactive elements
  const interactiveElements = ['button', 'a', 'input', 'select', 'textarea'];
  interactiveElements.forEach(tag => {
    const regex = new RegExp(`<${tag}[^>]*>`, 'g');
    const elements = html.match(regex) || [];
    elements.forEach(element => {
      // Skip if has text content or aria-label
      if (!element.includes('aria-label') && tag === 'button') {
        const hasIcon = element.includes('🌙') || element.includes('☀️') || element.includes('📥');
        if (hasIcon && !element.includes('aria-label')) {
          issues.push(`Icon button without aria-label`);
        }
      }
    });
  });
  
  // Check for form labels
  const inputs = html.match(/<input[^>]*>/g) || [];
  inputs.forEach(input => {
    if (!input.includes('type="hidden"') && !input.includes('type="submit"')) {
      const id = input.match(/id="([^"]+)"/);
      if (id) {
        const labelRegex = new RegExp(`<label[^>]*for="${id[1]}"`, 'g');
        if (!html.match(labelRegex)) {
          issues.push(`Input without associated label: ${id[1]}`);
        }
      }
    }
  });
  
  // Check color contrast (basic check for known issues)
  const lowContrastPatterns = [
    { pattern: 'color:#6b7280', context: 'Text may have low contrast' },
    { pattern: 'color:#9ca3af', context: 'Muted text may have low contrast' }
  ];
  
  lowContrastPatterns.forEach(({ pattern, context }) => {
    if (html.includes(pattern)) {
      issues.push(`Potential contrast issue: ${context}`);
    }
  });
  
  return issues;
}

// Check performance best practices
function checkPerformance(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  // Check for preload/prefetch
  if (!html.includes('rel="preload"')) {
    issues.push('No preload hints for critical resources');
  }
  
  // Check for external resources
  if (html.includes('fonts.googleapis.com') || html.includes('fonts.gstatic.com')) {
    issues.push('External font dependencies found (should be self-hosted)');
  }
  
  // Check for inline scripts (CSP compliance)
  const inlineScriptRegex = /<script[^>]*>[\s\S]+?<\/script>/g;
  const inlineScripts = html.match(inlineScriptRegex) || [];
  if (inlineScripts.length > 0) {
    // Check if they're just src references (not actual inline code)
    const hasInlineCode = inlineScripts.some(script => {
      // Remove the script tags
      const content = script.replace(/<script[^>]*>/, '').replace('</script>', '').trim();
      // If there's content and no src attribute, it's inline code
      return content && !script.includes('src=');
    });
    if (hasInlineCode) {
      issues.push('Inline scripts found (CSP violation)');
    }
  }
  
  // Check for critical CSS
  if (!html.includes('/* CRITICAL CSS')) {
    issues.push('No critical CSS inlined');
  }
  
  // Check image optimization hints
  const images = html.match(/<img[^>]*>/g) || [];
  images.forEach(img => {
    if (!img.includes('loading=')) {
      issues.push('Image without loading attribute');
    }
  });
  
  return issues;
}

// Main QA test runner
function runQATests() {
  console.log(`${colors.blue}${colors.bold}Running QA tests...${colors.reset}\n`);
  
  let totalIssues = 0;
  let criticalIssues = 0;
  const results = {};
  
  TEST_PAGES.forEach(({ url, name }) => {
    const filePath = path.join(__dirname, '..', url);
    
    if (!fs.existsSync(filePath)) {
      console.log(`${colors.yellow}⚠️  ${name}: File not found, skipping${colors.reset}`);
      return;
    }
    
    console.log(`${colors.cyan}Testing ${name}...${colors.reset}`);
    
    const pageIssues = {
      html: validateHTML(filePath),
      accessibility: checkAccessibility(filePath),
      performance: checkPerformance(filePath)
    };
    
    results[name] = pageIssues;
    
    // Count issues
    let pageIssueCount = 0;
    Object.values(pageIssues).forEach(issues => {
      pageIssueCount += issues.length;
    });
    
    totalIssues += pageIssueCount;
    
    // Report page results
    if (pageIssueCount === 0) {
      console.log(`${colors.green}  ✅ No issues found${colors.reset}`);
    } else {
      Object.entries(pageIssues).forEach(([category, issues]) => {
        if (issues.length > 0) {
          console.log(`  ${colors.yellow}${category}:${colors.reset}`);
          issues.forEach(issue => {
            console.log(`    - ${issue}`);
            if (category === 'accessibility') {
              criticalIssues++;
            }
          });
        }
      });
    }
    
    console.log('');
  });
  
  // Summary
  console.log(`${colors.bold}QA Test Summary:${colors.reset}`);
  console.log(`Total issues: ${totalIssues}`);
  console.log(`Critical accessibility issues: ${criticalIssues}`);
  
  // Quality score (simple calculation)
  const maxPossibleIssues = TEST_PAGES.length * 10; // Arbitrary baseline
  const score = Math.max(0, Math.round(100 - (totalIssues / maxPossibleIssues) * 100));
  
  console.log(`Quality score: ${score}/100`);
  
  // Pass/Fail determination
  const passed = criticalIssues === 0 && score >= 80;
  
  if (passed) {
    console.log(`\n${colors.green}${colors.bold}✅ QA Tests PASSED${colors.reset}`);
    
    // Write quality badge
    const badgeData = {
      score,
      timestamp: new Date().toISOString(),
      pages: TEST_PAGES.length,
      issues: totalIssues
    };
    
    const badgePath = path.join(__dirname, '..', 'public', 'quality-badge.json');
    fs.writeFileSync(badgePath, JSON.stringify(badgeData, null, 2));
    
  } else {
    console.log(`\n${colors.red}${colors.bold}❌ QA Tests FAILED${colors.reset}`);
    console.log(`Fix critical issues before deployment`);
    process.exit(1);
  }
  
  return { passed, score, totalIssues, criticalIssues };
}

// Run if called directly
if (require.main === module) {
  runQATests();
}

module.exports = { runQATests };