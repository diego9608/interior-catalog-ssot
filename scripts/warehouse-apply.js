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

// Apply transactions to offcuts
function applyTransactions(offcuts, transactions) {
  // Create offcuts map
  const offcutsMap = new Map();
  offcuts.forEach(o => offcutsMap.set(o.id, { ...o }));
  
  // Sort transactions by timestamp
  const sortedTx = [...transactions].sort((a, b) => 
    new Date(a.ts) - new Date(b.ts)
  );
  
  // Apply each transaction
  sortedTx.forEach(tx => {
    const offcut = offcutsMap.get(tx.offcut_id);
    
    switch (tx.type) {
      case 'IN':
        // Create or update offcut
        if (!offcut) {
          console.log(`${colors.yellow}Warning: IN transaction for non-existent offcut ${tx.offcut_id}${colors.reset}`);
        } else if (tx.payload?.location) {
          offcut.location = tx.payload.location;
          offcut.updated_at = tx.ts;
        }
        break;
        
      case 'RESERVE':
        if (offcut) {
          offcut.status = 'reserved';
          offcut.reserved_by = tx.project_id;
          offcut.updated_at = tx.ts;
        }
        break;
        
      case 'CONSUME':
        if (offcut) {
          offcut.status = 'consumed';
          offcut.reserved_by = null;
          offcut.updated_at = tx.ts;
        }
        break;
        
      case 'SPLIT':
        if (offcut && tx.payload?.new_offcut_id && tx.payload?.consumed) {
          // Mark original as consumed
          offcut.status = 'consumed';
          offcut.updated_at = tx.ts;
          
          // Create new offcut with remaining dimensions
          const consumed = tx.payload.consumed;
          const newOffcut = {
            ...offcut,
            id: tx.payload.new_offcut_id,
            w_mm: offcut.w_mm - (consumed.w_mm || 0),
            h_mm: offcut.h_mm - (consumed.h_mm || 0),
            area_m2: ((offcut.w_mm - (consumed.w_mm || 0)) * (offcut.h_mm - (consumed.h_mm || 0))) / 1000000,
            status: 'available',
            reserved_by: null,
            created_at: tx.ts,
            updated_at: tx.ts,
            notes: `Split from ${offcut.id}`
          };
          
          offcutsMap.set(newOffcut.id, newOffcut);
        }
        break;
        
      case 'MOVE':
        if (offcut && tx.payload?.location) {
          offcut.location = tx.payload.location;
          offcut.updated_at = tx.ts;
        }
        break;
        
      case 'SCRAP':
        if (offcut) {
          offcut.status = 'scrap';
          offcut.updated_at = tx.ts;
        }
        break;
        
      case 'ADJUST':
        if (offcut && tx.payload) {
          if (tx.payload.w_mm !== undefined) offcut.w_mm = tx.payload.w_mm;
          if (tx.payload.h_mm !== undefined) offcut.h_mm = tx.payload.h_mm;
          if (tx.payload.w_mm !== undefined || tx.payload.h_mm !== undefined) {
            offcut.area_m2 = (offcut.w_mm * offcut.h_mm) / 1000000;
          }
          offcut.updated_at = tx.ts;
        }
        break;
        
      default:
        console.log(`${colors.gray}Unknown transaction type: ${tx.type}${colors.reset}`);
    }
  });
  
  // Convert map back to array
  return Array.from(offcutsMap.values());
}

// Calculate stats
function calculateStats(offcuts) {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  
  const counts = {
    available: 0,
    reserved: 0,
    consumed: 0,
    scrap: 0
  };
  
  const area_m2 = {
    available: 0,
    reserved: 0,
    consumed_ytd: 0
  };
  
  offcuts.forEach(offcut => {
    // Count by status
    counts[offcut.status] = (counts[offcut.status] || 0) + 1;
    
    // Calculate areas
    if (offcut.status === 'available') {
      area_m2.available += offcut.area_m2;
    } else if (offcut.status === 'reserved') {
      area_m2.reserved += offcut.area_m2;
    } else if (offcut.status === 'consumed') {
      const consumedDate = new Date(offcut.updated_at);
      if (consumedDate >= yearStart) {
        area_m2.consumed_ytd += offcut.area_m2;
      }
    }
  });
  
  return {
    as_of: now.toISOString(),
    counts,
    area_m2: {
      available: parseFloat(area_m2.available.toFixed(3)),
      reserved: parseFloat(area_m2.reserved.toFixed(3)),
      consumed_ytd: parseFloat(area_m2.consumed_ytd.toFixed(3))
    }
  };
}

// Main execution
function main() {
  console.log(`${colors.blue}${colors.bold}Applying warehouse transactions...${colors.reset}`);
  
  const warehouseDir = path.join(__dirname, '..', 'public', 'api', 'warehouse');
  
  // Ensure directory exists
  if (!fs.existsSync(warehouseDir)) {
    fs.mkdirSync(warehouseDir, { recursive: true });
  }
  
  // Load offcuts
  const offcutsPath = path.join(warehouseDir, 'offcuts.json');
  let offcuts = [];
  if (fs.existsSync(offcutsPath)) {
    offcuts = JSON.parse(fs.readFileSync(offcutsPath, 'utf8'));
    console.log(`${colors.gray}Loaded ${offcuts.length} offcuts${colors.reset}`);
  }
  
  // Load transactions
  const txPath = path.join(warehouseDir, 'transactions.json');
  let transactions = [];
  if (fs.existsSync(txPath)) {
    transactions = JSON.parse(fs.readFileSync(txPath, 'utf8'));
    console.log(`${colors.gray}Loaded ${transactions.length} transactions${colors.reset}`);
  }
  
  // Apply transactions
  const updatedOffcuts = applyTransactions(offcuts, transactions);
  console.log(`${colors.cyan}Applied transactions to ${updatedOffcuts.length} offcuts${colors.reset}`);
  
  // Calculate stats
  const stats = calculateStats(updatedOffcuts);
  
  // Save normalized offcuts
  fs.writeFileSync(offcutsPath, JSON.stringify(updatedOffcuts, null, 2));
  
  // Save stats
  const statsPath = path.join(warehouseDir, 'stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  
  // Log summary
  console.log(`${colors.cyan}📦 Warehouse Summary:${colors.reset}`);
  console.log(`  Available: ${stats.counts.available} (${stats.area_m2.available} m²)`);
  console.log(`  Reserved: ${stats.counts.reserved} (${stats.area_m2.reserved} m²)`);
  console.log(`  Consumed YTD: ${stats.counts.consumed} (${stats.area_m2.consumed_ytd} m²)`);
  console.log(`  Scrap: ${stats.counts.scrap}`);
  
  console.log(`${colors.green}${colors.bold}✅ Warehouse consolidation complete${colors.reset}`);
}

// Run if called directly
if (require.main === module) {
  main();
}