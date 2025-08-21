// Trends functionality for ops dashboard
(function() {
  'use strict';

  // Export trends module
  window.opsT = window.opsTrends || {};
  
  // Date range utilities
  window.opsT.getDateRange = function(rangeType) {
    const now = new Date();
    const end = new Date(now);
    let start = new Date(now);
    
    switch(rangeType) {
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      case 'ytd':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
        start = new Date(2020, 0, 1); // Arbitrary early date
        break;
      case 'custom':
        // Get from inputs
        const fromInput = document.getElementById('date-from');
        const toInput = document.getElementById('date-to');
        if (fromInput && toInput && fromInput.value && toInput.value) {
          start = new Date(fromInput.value);
          end = new Date(toInput.value);
        }
        break;
    }
    
    return { start, end };
  };
  
  // Filter history by date range
  window.opsT.filterHistory = function(history, range, projectId = null) {
    const { start, end } = range;
    
    return history.filter(entry => {
      const date = new Date(entry.generated_at);
      const inRange = date >= start && date <= end;
      
      if (!inRange) return false;
      
      if (projectId && projectId !== 'all') {
        // Filter by specific project
        return entry.projects && entry.projects.some(p => p.projectId === projectId);
      }
      
      return true;
    });
  };
  
  // Aggregate metrics from history
  window.opsT.aggregateMetrics = function(filteredHistory, groupGlobal = false) {
    const metrics = {
      costP50: [],
      costP80: [],
      waste: [],
      qcPass: [],
      dates: []
    };
    
    filteredHistory.forEach(entry => {
      const date = new Date(entry.generated_at);
      metrics.dates.push(date);
      
      if (groupGlobal && entry.projects) {
        // Global aggregation
        const costs50 = entry.projects.map(p => p.cost_p50).filter(v => v !== null);
        const costs80 = entry.projects.map(p => p.cost_p80).filter(v => v !== null);
        const wastes = entry.projects.map(p => p.waste_pct).filter(v => v !== null);
        const qcPasses = entry.projects.map(p => p.qc_overall_pass === true ? 1 : 0);
        
        metrics.costP50.push(costs50.length > 0 ? median(costs50) : null);
        metrics.costP80.push(costs80.length > 0 ? median(costs80) : null);
        metrics.waste.push(wastes.length > 0 ? average(wastes) : null);
        metrics.qcPass.push(qcPasses.length > 0 ? average(qcPasses) : null);
      } else if (entry.projects) {
        // Per project (first match)
        const project = entry.projects[0];
        if (project) {
          metrics.costP50.push(project.cost_p50);
          metrics.costP80.push(project.cost_p80);
          metrics.waste.push(project.waste_pct);
          metrics.qcPass.push(project.qc_overall_pass === true ? 1 : 0);
        }
      }
    });
    
    return metrics;
  };
  
  // Draw sparkline SVG
  window.opsT.drawSparkline = function(svgId, values, target = null, formatFn = null) {
    const svg = document.getElementById(svgId);
    if (!svg || !values || values.length === 0) return;
    
    // Clear existing
    svg.innerHTML = '';
    
    // Filter out nulls for calculation
    const validValues = values.map((v, i) => ({ value: v, index: i }))
      .filter(item => item.value !== null);
    
    if (validValues.length === 0) return;
    
    const width = 300;
    const height = 60;
    const padding = 5;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    
    // Calculate min/max
    const allValues = validValues.map(v => v.value);
    if (target !== null) allValues.push(target);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;
    
    // Scale functions
    const xScale = (i) => padding + (i / (values.length - 1)) * plotWidth;
    const yScale = (v) => padding + plotHeight - ((v - min) / range) * plotHeight;
    
    // Draw target line if exists
    if (target !== null) {
      const targetY = yScale(target);
      const targetLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      targetLine.setAttribute('x1', padding);
      targetLine.setAttribute('y1', targetY);
      targetLine.setAttribute('x2', width - padding);
      targetLine.setAttribute('y2', targetY);
      targetLine.setAttribute('stroke', 'var(--warning)');
      targetLine.setAttribute('stroke-width', '1');
      targetLine.setAttribute('stroke-dasharray', '4,2');
      targetLine.setAttribute('opacity', '0.5');
      svg.appendChild(targetLine);
    }
    
    // Create path for line
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let d = '';
    
    validValues.forEach((item, i) => {
      const x = xScale(item.index);
      const y = yScale(item.value);
      d += (i === 0 ? 'M' : 'L') + ` ${x} ${y}`;
    });
    
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--accent)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    
    // Add dots and tooltips
    validValues.forEach((item, i) => {
      const x = xScale(item.index);
      const y = yScale(item.value);
      
      // Circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', 'var(--accent)');
      
      // Tooltip
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      let tooltipText = formatFn ? formatFn(item.value) : item.value.toFixed(2);
      if (target !== null) {
        const delta = item.value - target;
        const deltaSign = delta >= 0 ? '+' : '';
        tooltipText += ` (${deltaSign}${formatFn ? formatFn(delta) : delta.toFixed(2)} vs meta)`;
      }
      title.textContent = tooltipText;
      circle.appendChild(title);
      
      svg.appendChild(circle);
    });
  };
  
  // Initialize trends
  window.opsT.initTrends = function(history) {
    // Set up event listeners
    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const range = btn.dataset.range;
        const customDates = document.getElementById('custom-dates');
        if (range === 'custom') {
          customDates.classList.remove('hidden');
        } else {
          customDates.classList.add('hidden');
        }
        
        window.opsT.updateTrends(history);
      });
    });
    
    // Date input changes
    document.getElementById('date-from')?.addEventListener('change', () => {
      if (document.querySelector('.range-btn[data-range="custom"]').classList.contains('active')) {
        window.opsT.updateTrends(history);
      }
    });
    
    document.getElementById('date-to')?.addEventListener('change', () => {
      if (document.querySelector('.range-btn[data-range="custom"]').classList.contains('active')) {
        window.opsT.updateTrends(history);
      }
    });
    
    // Group toggle
    document.getElementById('group-global')?.addEventListener('change', () => {
      window.opsT.updateTrends(history);
    });
    
    // Initial update
    window.opsT.updateTrends(history);
  };
  
  // Update trends display
  window.opsT.updateTrends = function(history) {
    // Get current settings
    const activeRange = document.querySelector('.range-btn.active')?.dataset.range || '30d';
    const range = window.opsT.getDateRange(activeRange);
    const projectFilter = document.getElementById('project-filter')?.value || 'all';
    const groupGlobal = document.getElementById('group-global')?.checked || false;
    
    // Filter history
    const filtered = window.opsT.filterHistory(history, range, groupGlobal ? null : projectFilter);
    
    // Aggregate metrics
    const metrics = window.opsT.aggregateMetrics(filtered, groupGlobal);
    
    // Draw sparklines
    window.opsT.drawSparkline('trend-cost-p50', metrics.costP50, null, v => `$${(v/1000).toFixed(0)}k`);
    window.opsT.drawSparkline('trend-cost-p80', metrics.costP80, null, v => `$${(v/1000).toFixed(0)}k`);
    window.opsT.drawSparkline('trend-waste', metrics.waste, null, v => `${(v*100).toFixed(1)}%`);
    window.opsT.drawSparkline('trend-qc', metrics.qcPass, null, v => `${(v*100).toFixed(0)}%`);
  };
  
  // Helper functions
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  function average(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
})();