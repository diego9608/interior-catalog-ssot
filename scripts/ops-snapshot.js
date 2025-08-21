#!/usr/bin/env node

/**
 * Generate KPI snapshots during build
 * Writes to public/api/ops/snapshots/ and updates history.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Paths
const OPS_API_DIR = path.join(__dirname, '..', 'public', 'api', 'ops');
const SNAPSHOTS_DIR = path.join(OPS_API_DIR, 'snapshots');
const HISTORY_PATH = path.join(OPS_API_DIR, 'history.json');
const INDEX_PATH = path.join(OPS_API_DIR, 'index.json');

// Ensure directories exist
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Get git commit hash
function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

// Load current KPIs
function loadCurrentKPIs() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.warn('⚠️  No index.json found, skipping snapshot');
    return null;
  }
  
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (e) {
    console.error('Error loading index.json:', e.message);
    return null;
  }
}

// Create snapshot entry
function createSnapshot(projects) {
  const now = new Date();
  const commit = getGitCommit();
  
  return {
    generated_at: now.toISOString(),
    commit: commit,
    build_env: process.env.NODE_ENV || 'development',
    projects: projects.map(p => ({
      projectId: p.projectId,
      cliente: p.cliente,
      cost_p50: p.cost_p50,
      cost_p80: p.cost_p80,
      waste_pct: p.waste_pct,
      timeline_days_p50: p.timeline_days_p50,
      timeline_days_p80: p.timeline_days_p80,
      qc_overall_pass: p.qc_overall_pass,
      pieces_count: p.pieces_count || null,
      sheets_used: p.sheets_used || null
    }))
  };
}

// Update history
function updateHistory(snapshot) {
  let history = [];
  
  // Load existing history
  if (fs.existsSync(HISTORY_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
      if (!Array.isArray(history)) {
        history = [];
      }
    } catch (e) {
      console.warn('Could not parse history.json, starting fresh');
      history = [];
    }
  }
  
  // Add new snapshot
  history.push(snapshot);
  
  // Keep only last 365 days or 1000 entries (whichever is smaller)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  history = history.filter(entry => {
    const date = new Date(entry.generated_at);
    return date >= oneYearAgo;
  });
  
  if (history.length > 1000) {
    history = history.slice(-1000);
  }
  
  // Write updated history
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  
  return history.length;
}

// Save individual snapshot
function saveSnapshot(snapshot) {
  const timestamp = snapshot.generated_at.replace(/[:.]/g, '-').split('T')[0];
  const filename = `snapshot_${timestamp}_${snapshot.commit}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
  
  // Also save as latest
  const latestPath = path.join(SNAPSHOTS_DIR, 'latest.json');
  fs.copyFileSync(filepath, latestPath);
  
  return filename;
}

// Clean old snapshots (keep last 30)
function cleanOldSnapshots() {
  const files = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length > 30) {
    const toDelete = files.slice(30);
    toDelete.forEach(file => {
      fs.unlinkSync(path.join(SNAPSHOTS_DIR, file));
    });
    return toDelete.length;
  }
  
  return 0;
}

// Main
async function main() {
  console.log('📸 Generating ops snapshot...');
  
  // Load current KPIs
  const projects = loadCurrentKPIs();
  if (!projects || projects.length === 0) {
    console.log('   No projects to snapshot');
    return;
  }
  
  // Create snapshot
  const snapshot = createSnapshot(projects);
  console.log(`   Projects: ${projects.length}`);
  console.log(`   Commit: ${snapshot.commit}`);
  
  // Save snapshot
  const filename = saveSnapshot(snapshot);
  console.log(`   Saved: ${filename}`);
  
  // Update history
  const historyCount = updateHistory(snapshot);
  console.log(`   History entries: ${historyCount}`);
  
  // Clean old snapshots
  const deleted = cleanOldSnapshots();
  if (deleted > 0) {
    console.log(`   Cleaned ${deleted} old snapshots`);
  }
  
  console.log('✅ Snapshot complete');
}

// Run
main().catch(error => {
  console.error('Error generating snapshot:', error);
  process.exit(1);
});