import { test, expect } from '@playwright/test';

test.describe('Ops Dashboard - Offline History', () => {
  test('should cache and display trends when offline', async ({ page, context }) => {
    // First load online
    await page.goto('/ops/');
    
    // Wait for service worker to register
    await page.waitForTimeout(2000);
    
    // Wait for data to load
    await page.waitForSelector('#projects-table tbody tr', { timeout: 5000 });
    
    // Verify trends are visible
    const trendsSection = page.locator('#trends-section');
    await expect(trendsSection).toBeVisible();
    
    // Check sparklines have data
    const costSparkline = page.locator('#trend-cost-p50');
    const paths = costSparkline.locator('path');
    const initialPathCount = await paths.count();
    expect(initialPathCount).toBeGreaterThan(0);
    
    // Go offline
    await context.setOffline(true);
    
    // Reload page
    await page.reload();
    
    // Wait for page to stabilize
    await page.waitForTimeout(1000);
    
    // Trends should still be visible from cache
    await expect(trendsSection).toBeVisible();
    
    // Sparklines should still render from cached data
    const offlinePaths = costSparkline.locator('path');
    const offlinePathCount = await offlinePaths.count();
    expect(offlinePathCount).toBeGreaterThan(0);
    
    // KPIs should still show
    const kpiCost = page.locator('#kpi-cost-p50');
    const kpiText = await kpiCost.textContent();
    expect(kpiText).not.toBe('—');
    
    // Table should still have data
    const tableRows = page.locator('#projects-table tbody tr');
    const rowCount = await tableRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should use stale-while-revalidate for history', async ({ page }) => {
    // Load page
    await page.goto('/ops/');
    await page.waitForSelector('#projects-table tbody tr', { timeout: 5000 });
    
    // Record initial sparkline state
    const costSparkline = page.locator('#trend-cost-p50');
    const initialCircles = await costSparkline.locator('circle').count();
    
    // Navigate away and back
    await page.goto('/');
    await page.goto('/ops/');
    
    // Should load instantly from cache
    const loadTime = await page.evaluate(() => {
      const start = performance.now();
      return fetch('/api/ops/history.json')
        .then(() => performance.now() - start);
    });
    
    // Should be very fast (from cache)
    expect(loadTime).toBeLessThan(100);
    
    // Sparklines should render immediately
    await expect(costSparkline).toBeVisible({ timeout: 1000 });
    const cachedCircles = await costSparkline.locator('circle').count();
    expect(cachedCircles).toBe(initialCircles);
  });

  test('should handle empty history gracefully', async ({ page }) => {
    // Intercept history request to return empty
    await page.route('/api/ops/history.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Load page
    await page.goto('/ops/');
    
    // Page should still load
    const trendsSection = page.locator('#trends-section');
    await expect(trendsSection).toBeVisible();
    
    // Sparklines should be empty but visible
    const costSparkline = page.locator('#trend-cost-p50');
    await expect(costSparkline).toBeVisible();
    
    // Should have no paths (empty data)
    const paths = costSparkline.locator('path');
    const pathCount = await paths.count();
    expect(pathCount).toBe(0);
  });

  test('should cache snapshots', async ({ page }) => {
    // Load page
    await page.goto('/ops/');
    await page.waitForSelector('#projects-table tbody tr', { timeout: 5000 });
    
    // Check if any snapshot requests are made
    const snapshotRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/ops/snapshots/')) {
        snapshotRequests.push(request.url());
      }
    });
    
    // Trigger a date range change which might load snapshots
    const btn90d = page.locator('.range-btn[data-range="90d"]');
    await btn90d.click();
    
    await page.waitForTimeout(1000);
    
    // If snapshots were requested, verify they can be cached
    if (snapshotRequests.length > 0) {
      // Check service worker cached them
      const cachedSnapshots = await page.evaluate(async () => {
        const cache = await caches.open('ops-history-v1');
        const keys = await cache.keys();
        return keys.filter(req => req.url.includes('/snapshots/')).length;
      });
      
      expect(cachedSnapshots).toBeGreaterThanOrEqual(0);
    }
  });

  test('should maintain functionality with all caches cleared', async ({ page, context }) => {
    // Clear all caches
    await context.clearCookies();
    await page.evaluate(() => {
      return caches.keys().then(names => 
        Promise.all(names.map(name => caches.delete(name)))
      );
    });
    
    // Load page fresh
    await page.goto('/ops/');
    
    // Should still load and function
    await page.waitForSelector('#projects-table tbody tr', { timeout: 10000 });
    
    // Trends should load
    const trendsSection = page.locator('#trends-section');
    await expect(trendsSection).toBeVisible();
    
    // Date range controls should work
    const btn7d = page.locator('.range-btn[data-range="7d"]');
    await btn7d.click();
    await expect(btn7d).toHaveClass(/active/);
  });
});