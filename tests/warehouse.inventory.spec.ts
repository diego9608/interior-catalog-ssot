import { test, expect } from '@playwright/test';

test.describe('Warehouse Inventory', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ops/#/warehouse');
    // Wait for warehouse to load
    await page.waitForSelector('#warehouse-tbody', { timeout: 5000 });
  });

  test('should display warehouse section with KPIs', async ({ page }) => {
    // Check warehouse section is visible
    const warehouseSection = page.locator('#warehouse-section');
    await expect(warehouseSection).toBeVisible();
    
    // Check KPIs are displayed
    const kpis = page.locator('#warehouse-kpis');
    await expect(kpis).toBeVisible();
    
    // Check specific KPI cards
    const availableKpi = kpis.locator('.kpi-card').filter({ hasText: 'Disponible' });
    await expect(availableKpi).toBeVisible();
    
    const areaKpi = kpis.locator('.kpi-card').filter({ hasText: 'Área Total' });
    await expect(areaKpi).toBeVisible();
  });

  test('should filter inventory by material', async ({ page }) => {
    // Enter material filter
    const materialFilter = page.locator('#filter-material');
    await materialFilter.fill('MDF');
    
    // Check filtered results
    await page.waitForTimeout(500); // Wait for filter to apply
    
    const rows = page.locator('#warehouse-tbody tr');
    const count = await rows.count();
    
    if (count > 0) {
      // Check all visible rows contain MDF
      for (let i = 0; i < count; i++) {
        const materialCell = rows.nth(i).locator('td').nth(2);
        const text = await materialCell.textContent();
        expect(text?.toLowerCase()).toContain('mdf');
      }
    }
  });

  test('should filter by status', async ({ page }) => {
    // Select available status
    const statusFilter = page.locator('#filter-status');
    await statusFilter.selectOption('available');
    
    await page.waitForTimeout(500);
    
    const rows = page.locator('#warehouse-tbody tr');
    const count = await rows.count();
    
    if (count > 0) {
      // Check all rows have available status
      for (let i = 0; i < count; i++) {
        const statusCell = rows.nth(i).locator('.badge');
        const text = await statusCell.textContent();
        expect(text?.toLowerCase()).toBe('available');
      }
    }
  });

  test('should search by ID', async ({ page }) => {
    // Search for specific ID
    const searchInput = page.locator('#filter-search');
    await searchInput.fill('OC-20250821-0001');
    
    await page.waitForTimeout(500);
    
    const rows = page.locator('#warehouse-tbody tr');
    const count = await rows.count();
    
    // Should find at most 1 result
    expect(count).toBeLessThanOrEqual(1);
    
    if (count === 1) {
      const idCell = rows.first().locator('.offcut-id');
      const id = await idCell.textContent();
      expect(id).toBe('OC-20250821-0001');
    }
  });

  test('should verify KPIs match filtered table', async ({ page }) => {
    // Get initial available count from KPI
    const availableKpi = page.locator('#warehouse-kpis .kpi-value').first();
    const kpiValue = await availableKpi.textContent();
    const kpiCount = parseInt(kpiValue || '0');
    
    // Filter by available status
    const statusFilter = page.locator('#filter-status');
    await statusFilter.selectOption('available');
    
    await page.waitForTimeout(500);
    
    // Count table rows
    const rows = page.locator('#warehouse-tbody tr');
    const tableCount = await rows.count();
    
    // KPI should match filtered count
    expect(tableCount).toBe(kpiCount);
  });

  test('should open new offcut modal', async ({ page }) => {
    // Click new offcut button
    const newBtn = page.locator('button').filter({ hasText: 'Nuevo' });
    await newBtn.click();
    
    // Check modal appears
    const modal = page.locator('#warehouse-modal');
    await expect(modal).toBeVisible();
    
    // Check form fields exist
    const materialCode = page.locator('#material-code');
    await expect(materialCode).toBeVisible();
    
    const thickness = page.locator('#thickness');
    await expect(thickness).toBeVisible();
    
    // Cancel modal
    const cancelBtn = modal.locator('button').filter({ hasText: 'Cancelar' });
    await cancelBtn.click();
    
    // Modal should be hidden
    await expect(modal).not.toBeVisible();
  });

  test('should select offcuts for label printing', async ({ page }) => {
    // Select first two checkboxes
    const checkboxes = page.locator('.offcut-select');
    const count = await checkboxes.count();
    
    if (count >= 2) {
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
      
      // Click print labels
      const printBtn = page.locator('button').filter({ hasText: 'Imprimir Etiquetas' });
      await printBtn.click();
      
      // Should navigate to labels view
      await page.waitForURL('**/warehouse/labels');
      
      // Labels section should be visible
      const labelsSection = page.locator('#labels-section');
      await expect(labelsSection).toBeVisible();
    }
  });

  test('should export CSV inventory', async ({ page }) => {
    // Navigate to warehouse
    await page.goto('/ops/#/warehouse');
    
    // Wait for export button to be visible
    const exportBtn = page.locator('#export-csv');
    await expect(exportBtn).toBeVisible();
    
    // Setup download promise
    const downloadPromise = page.waitForEvent('download');
    
    // Click export (warehouse module should handle this)
    await page.evaluate(() => {
      if (window.warehouse) {
        window.warehouse.exportCSV();
      }
    });
    
    // Wait for download
    const download = await downloadPromise;
    
    // Check filename
    const filename = download.suggestedFilename();
    expect(filename).toContain('warehouse-inventory');
    expect(filename).toEndWith('.csv');
  });

  test('should export JSON patch', async ({ page }) => {
    // Add a transaction to buffer first
    await page.evaluate(() => {
      const tx = {
        id: 'TX-TEST-001',
        ts: new Date().toISOString(),
        type: 'TEST',
        offcut_id: 'OC-TEST-001',
        project_id: null,
        payload: {},
        user: 'test',
        note: 'Test transaction'
      };
      localStorage.setItem('wh.tx.buffer', JSON.stringify([tx]));
    });
    
    // Click export patch button
    const exportPatchBtn = page.locator('#export-patch');
    await expect(exportPatchBtn).toBeVisible();
    
    // Setup download promise
    const downloadPromise = page.waitForEvent('download');
    
    await exportPatchBtn.click();
    
    // Wait for download
    const download = await downloadPromise;
    
    // Check filename
    const filename = download.suggestedFilename();
    expect(filename).toContain('warehouse-patch');
    expect(filename).toEndWith('.json');
  });
});