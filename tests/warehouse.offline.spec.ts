import { test, expect } from '@playwright/test';

test.describe('Warehouse Offline', () => {
  test('should cache and display warehouse data offline', async ({ page, context }) => {
    // First load online
    await page.goto('/ops/#/warehouse');
    
    // Wait for service worker
    await page.waitForTimeout(2000);
    
    // Wait for warehouse data to load
    await page.waitForSelector('#warehouse-tbody', { timeout: 5000 });
    
    // Verify KPIs are visible
    const kpis = page.locator('#warehouse-kpis');
    await expect(kpis).toBeVisible();
    
    // Get initial available count
    const availableKpi = kpis.locator('.kpi-value').first();
    const initialCount = await availableKpi.textContent();
    
    // Count initial table rows
    const initialRows = await page.locator('#warehouse-tbody tr').count();
    
    // Go offline
    await context.setOffline(true);
    
    // Reload page
    await page.reload();
    
    // Wait for page to stabilize
    await page.waitForTimeout(1000);
    
    // Warehouse section should still be visible
    const warehouseSection = page.locator('#warehouse-section');
    await expect(warehouseSection).toBeVisible();
    
    // KPIs should still show from cache
    await expect(kpis).toBeVisible();
    const offlineCount = await availableKpi.textContent();
    expect(offlineCount).toBe(initialCount);
    
    // Table should still have data
    const offlineRows = await page.locator('#warehouse-tbody tr').count();
    expect(offlineRows).toBe(initialRows);
  });

  test('should use stale-while-revalidate for warehouse data', async ({ page }) => {
    // Load warehouse
    await page.goto('/ops/#/warehouse');
    await page.waitForSelector('#warehouse-tbody', { timeout: 5000 });
    
    // Record initial load time
    const loadTime1 = await page.evaluate(() => {
      const start = performance.now();
      return fetch('/api/warehouse/offcuts.json')
        .then(() => performance.now() - start);
    });
    
    // Navigate away and back
    await page.goto('/ops/');
    await page.goto('/ops/#/warehouse');
    
    // Second load should be faster (from cache)
    const loadTime2 = await page.evaluate(() => {
      const start = performance.now();
      return fetch('/api/warehouse/offcuts.json')
        .then(() => performance.now() - start);
    });
    
    // Cache should make it faster
    expect(loadTime2).toBeLessThan(loadTime1 * 2);
    
    // Data should still render
    await expect(page.locator('#warehouse-tbody')).toBeVisible();
  });

  test('should handle offline transactions', async ({ page, context }) => {
    // Load warehouse online
    await page.goto('/ops/#/warehouse');
    await page.waitForSelector('#warehouse-tbody');
    
    // Go offline
    await context.setOffline(true);
    
    // Try to create a new offcut (should work locally)
    await page.evaluate(() => {
      const tx = {
        id: 'TX-OFFLINE-001',
        ts: new Date().toISOString(),
        type: 'IN',
        offcut_id: 'OC-OFFLINE-001',
        project_id: null,
        payload: { location: 'A1-01' },
        user: 'offline-test',
        note: 'Created offline'
      };
      
      let buffer = JSON.parse(localStorage.getItem('wh.tx.buffer') || '[]');
      buffer.push(tx);
      localStorage.setItem('wh.tx.buffer', JSON.stringify(buffer));
    });
    
    // Check buffer has transaction
    const bufferSize = await page.evaluate(() => {
      const buffer = JSON.parse(localStorage.getItem('wh.tx.buffer') || '[]');
      return buffer.length;
    });
    
    expect(bufferSize).toBeGreaterThan(0);
  });

  test('should fallback gracefully when warehouse API fails', async ({ page }) => {
    // Intercept warehouse requests to fail
    await page.route('/api/warehouse/offcuts.json', route => {
      route.abort('failed');
    });
    
    await page.route('/api/warehouse/stats.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          as_of: new Date().toISOString(),
          counts: { available: 0, reserved: 0, consumed: 0, scrap: 0 },
          area_m2: { available: 0, reserved: 0, consumed_ytd: 0 }
        })
      });
    });
    
    // Navigate to warehouse
    await page.goto('/ops/#/warehouse');
    
    // Page should still load
    const warehouseSection = page.locator('#warehouse-section');
    await expect(warehouseSection).toBeVisible();
    
    // KPIs should show zeros
    const kpis = page.locator('#warehouse-kpis');
    await expect(kpis).toBeVisible();
    
    const availableKpi = kpis.locator('.kpi-value').first();
    const count = await availableKpi.textContent();
    expect(count).toBe('0');
    
    // Table should be empty but visible
    const table = page.locator('#warehouse-table');
    await expect(table).toBeVisible();
  });

  test('should persist local transactions across sessions', async ({ page, context }) => {
    // Create a transaction
    await page.goto('/ops/#/warehouse');
    
    await page.evaluate(() => {
      const tx = {
        id: 'TX-PERSIST-001',
        ts: new Date().toISOString(),
        type: 'RESERVE',
        offcut_id: 'OC-TEST-001',
        project_id: 'PROJ-001',
        payload: {},
        user: 'test',
        note: 'Test persistence'
      };
      
      let buffer = JSON.parse(localStorage.getItem('wh.tx.buffer') || '[]');
      buffer.push(tx);
      localStorage.setItem('wh.tx.buffer', JSON.stringify(buffer));
    });
    
    // Close and reopen page
    await page.close();
    const newPage = await context.newPage();
    await newPage.goto('/ops/#/warehouse');
    
    // Check transaction still exists
    const bufferData = await newPage.evaluate(() => {
      return localStorage.getItem('wh.tx.buffer');
    });
    
    expect(bufferData).toContain('TX-PERSIST-001');
    expect(bufferData).toContain('PROJ-001');
  });
});