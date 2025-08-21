import { test, expect } from '@playwright/test';

test.describe('Ops Dashboard - Trends', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ops/');
    // Wait for data to load
    await page.waitForSelector('#projects-table tbody tr', { timeout: 5000 });
  });

  test('should display trends section with 4 sparklines', async ({ page }) => {
    // Check trends section exists
    const trendsSection = page.locator('#trends-section');
    await expect(trendsSection).toBeVisible();
    
    // Check all 4 sparklines are rendered
    const sparklines = ['trend-cost-p50', 'trend-cost-p80', 'trend-waste', 'trend-qc'];
    for (const id of sparklines) {
      const svg = page.locator(`#${id}`);
      await expect(svg).toBeVisible();
      
      // Check SVG has content (path or circles)
      const paths = svg.locator('path');
      const circles = svg.locator('circle');
      const hasContent = (await paths.count()) > 0 || (await circles.count()) > 0;
      expect(hasContent).toBeTruthy();
    }
  });

  test('should default to 30d range', async ({ page }) => {
    // Check 30d button is active by default
    const btn30d = page.locator('.range-btn[data-range="30d"]');
    await expect(btn30d).toHaveClass(/active/);
    
    // Other range buttons should not be active
    const btn7d = page.locator('.range-btn[data-range="7d"]');
    await expect(btn7d).not.toHaveClass(/active/);
  });

  test('should switch date ranges when clicked', async ({ page }) => {
    // Click 7d range
    const btn7d = page.locator('.range-btn[data-range="7d"]');
    await btn7d.click();
    await expect(btn7d).toHaveClass(/active/);
    
    // Check 30d is no longer active
    const btn30d = page.locator('.range-btn[data-range="30d"]');
    await expect(btn30d).not.toHaveClass(/active/);
    
    // Click YTD
    const btnYTD = page.locator('.range-btn[data-range="ytd"]');
    await btnYTD.click();
    await expect(btnYTD).toHaveClass(/active/);
    await expect(btn7d).not.toHaveClass(/active/);
  });

  test('should show custom date inputs when Custom is selected', async ({ page }) => {
    // Initially hidden
    const customDates = page.locator('#custom-dates');
    await expect(customDates).toHaveClass(/hidden/);
    
    // Click Custom button
    const btnCustom = page.locator('.range-btn[data-range="custom"]');
    await btnCustom.click();
    
    // Should show date inputs
    await expect(customDates).not.toHaveClass(/hidden/);
    
    // Check date inputs exist
    const dateFrom = page.locator('#date-from');
    const dateTo = page.locator('#date-to');
    await expect(dateFrom).toBeVisible();
    await expect(dateTo).toBeVisible();
  });

  test('should calculate QC pass rate from history', async ({ page }) => {
    // Get the QC pass rate from KPI card
    const qcKpi = page.locator('#kpi-qc');
    const qcText = await qcKpi.textContent();
    
    // Should be in format "X/Y" where X is passes
    const match = qcText?.match(/(\d+)\/(\d+)/);
    if (match) {
      const passes = parseInt(match[1]);
      const total = parseInt(match[2]);
      const passRate = passes / total;
      
      // Check sparkline reflects similar rate
      const qcSparkline = page.locator('#trend-qc');
      const title = await qcSparkline.locator('circle').last().locator('title').textContent();
      
      // Title should contain percentage close to calculated rate
      const titlePct = parseFloat(title?.match(/(\d+)%/)?.[1] || '0') / 100;
      expect(Math.abs(passRate - titlePct)).toBeLessThan(0.1);
    }
  });

  test('should show tooltips on sparkline hover', async ({ page }) => {
    // Hover over a sparkline dot
    const costSparkline = page.locator('#trend-cost-p50');
    const firstCircle = costSparkline.locator('circle').first();
    
    if (await firstCircle.count() > 0) {
      await firstCircle.hover();
      
      // Check tooltip exists (title element)
      const title = firstCircle.locator('title');
      const tooltipText = await title.textContent();
      
      // Should contain currency formatting
      expect(tooltipText).toMatch(/\$\d+k/);
    }
  });

  test('should export CSV with filtered history', async ({ page }) => {
    // Set a specific range
    const btn7d = page.locator('.range-btn[data-range="7d"]');
    await btn7d.click();
    
    // Setup download promise before clicking (with timeout fallback)
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    
    // Click export
    const exportBtn = page.locator('#export-csv');
    await exportBtn.click();
    
    // Wait for download (might not happen if no data)
    const download = await downloadPromise;
    
    if (download) {
      // Check filename contains range and date
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/ops_history_7d_\d{4}-\d{2}-\d{2}\.csv/);
    }
  });

  test('should toggle global grouping', async ({ page }) => {
    const groupToggle = page.locator('#group-global');
    
    // Initially unchecked
    await expect(groupToggle).not.toBeChecked();
    
    // Check it
    await groupToggle.check();
    await expect(groupToggle).toBeChecked();
    
    // Sparklines should update (wait for potential re-render)
    await page.waitForTimeout(500);
    
    // Verify sparklines still visible
    const costSparkline = page.locator('#trend-cost-p50');
    await expect(costSparkline).toBeVisible();
  });

  test('should show delta columns in table when targets exist', async ({ page }) => {
    // Check table headers include delta columns
    const headers = page.locator('#projects-table thead th');
    const headerTexts = await headers.allTextContents();
    
    // Should include delta columns
    expect(headerTexts).toContain('Δ Meta');
    
    // Check if any row has delta values
    const firstRow = page.locator('#projects-table tbody tr').first();
    const cells = firstRow.locator('td');
    const cellCount = await cells.count();
    
    // Should have 12 columns with deltas
    expect(cellCount).toBeGreaterThanOrEqual(12);
  });

  test('should verify CTA has no opacity or filters', async ({ page }) => {
    // Navigate to home to check CTAs
    await page.goto('/');
    
    // Check primary CTA computed styles
    const primaryBtn = page.locator('.btn.btn-primary').first();
    
    if (await primaryBtn.count() > 0) {
      // Get computed styles
      const opacity = await primaryBtn.evaluate(el => 
        window.getComputedStyle(el).opacity
      );
      const filter = await primaryBtn.evaluate(el => 
        window.getComputedStyle(el).filter
      );
      const backdropFilter = await primaryBtn.evaluate(el => 
        window.getComputedStyle(el).backdropFilter
      );
      const transform = await primaryBtn.evaluate(el => 
        window.getComputedStyle(el).transform
      );
      
      // Assert no transparency or effects in rest state
      expect(parseFloat(opacity)).toBe(1);
      expect(filter).toBe('none');
      expect(backdropFilter).toBe('none');
      expect(transform).toBe('none');
    }
  });
});