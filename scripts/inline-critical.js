const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Files to process
const criticalMappings = [
  {
    html: path.join(__dirname, '..', 'public', 'index.html'),
    critical: path.join(__dirname, '..', 'public', 'home.critical.css'),
    name: 'Home'
  },
  {
    html: path.join(__dirname, '..', 'public', 'ops', 'index.html'),
    critical: path.join(__dirname, '..', 'public', 'ops.critical.css'),
    name: 'Ops Dashboard'
  }
];

function inlineCriticalCSS() {
  console.log(`${colors.blue}${colors.bold}Inlining critical CSS for better LCP...${colors.reset}`);
  
  let totalInlined = 0;
  let totalSaved = 0;
  
  criticalMappings.forEach(({ html, critical, name }) => {
    try {
      // Check if critical CSS exists
      if (!fs.existsSync(critical)) {
        console.log(`${colors.yellow}⚠️  No critical CSS found for ${name}, skipping${colors.reset}`);
        return;
      }
      
      // Read files
      let htmlContent = fs.readFileSync(html, 'utf8');
      const criticalCSS = fs.readFileSync(critical, 'utf8');
      
      // Minify critical CSS (basic)
      const minifiedCSS = criticalCSS
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around syntax
        .trim();
      
      // Check if already inlined (to make idempotent)
      const criticalMarker = '/* CRITICAL CSS START */';
      const criticalEndMarker = '/* CRITICAL CSS END */';
      
      // Remove existing critical CSS if present
      const criticalRegex = new RegExp(
        `<style[^>]*>${criticalMarker}[\\s\\S]*?${criticalEndMarker}</style>`,
        'g'
      );
      htmlContent = htmlContent.replace(criticalRegex, '');
      
      // Create inline style tag
      const inlineStyle = `<style>${criticalMarker}${minifiedCSS}${criticalEndMarker}</style>`;
      
      // Insert before first <link rel="stylesheet"> or before </head>
      const stylesheetMatch = htmlContent.match(/<link[^>]*rel="stylesheet"[^>]*>/);
      
      if (stylesheetMatch) {
        // Insert before first stylesheet
        htmlContent = htmlContent.replace(
          stylesheetMatch[0],
          `${inlineStyle}\n  ${stylesheetMatch[0]}`
        );
      } else {
        // Insert before </head>
        htmlContent = htmlContent.replace('</head>', `  ${inlineStyle}\n</head>`);
      }
      
      // Write updated HTML
      fs.writeFileSync(html, htmlContent);
      
      const sizeKB = (minifiedCSS.length / 1024).toFixed(2);
      totalInlined++;
      totalSaved += minifiedCSS.length;
      
      console.log(`${colors.cyan}✅ ${name}: ${sizeKB}KB critical CSS inlined${colors.reset}`);
      
    } catch (error) {
      console.error(`${colors.yellow}⚠️  Error processing ${name}: ${error.message}${colors.reset}`);
    }
  });
  
  if (totalInlined > 0) {
    const totalKB = (totalSaved / 1024).toFixed(2);
    console.log(`${colors.green}${colors.bold}✅ Critical CSS inlined: ${totalInlined} files, ${totalKB}KB total${colors.reset}`);
  }
}

// Main execution
function main() {
  inlineCriticalCSS();
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { inlineCriticalCSS };