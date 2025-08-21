import { test, expect } from '@playwright/test';

test.describe('Warehouse Labels', () => {
  test('should generate and display labels with QR codes', async ({ page }) => {
    // Navigate to warehouse
    await page.goto('/ops/#/warehouse');
    await page.waitForSelector('#warehouse-tbody', { timeout: 5000 });
    
    // Select first two offcuts
    const checkboxes = page.locator('.offcut-select');
    const count = await checkboxes.count();
    
    if (count >= 2) {
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
      
      // Store selected IDs for verification
      const selectedIds = [];
      for (let i = 0; i < 2; i++) {
        const row = page.locator('#warehouse-tbody tr').nth(i);
        const id = await row.locator('.offcut-id').textContent();
        if (id) selectedIds.push(id);
      }
      
      // Click print labels
      const printBtn = page.locator('button').filter({ hasText: 'Imprimir Etiquetas' });
      await printBtn.click();
      
      // Wait for navigation to labels view
      await page.waitForURL('**/warehouse/labels');
      
      // Check labels container exists
      const labelsContainer = page.locator('#labels-container');
      await expect(labelsContainer).toBeVisible();
      
      // Check labels grid exists
      const labelsGrid = page.locator('.labels-grid');
      await expect(labelsGrid).toBeVisible();
      
      // Check we have 2 labels
      const labels = labelsGrid.locator('.label');
      await expect(labels).toHaveCount(2);
      
      // Check each label has QR code
      for (let i = 0; i < 2; i++) {
        const label = labels.nth(i);
        
        // Check QR SVG exists
        const qr = label.locator('.label-qr svg');
        await expect(qr).toBeVisible();
        
        // Check label has ID
        const labelId = label.locator('.label-id');
        const idText = await labelId.textContent();
        expect(selectedIds).toContain(idText);
        
        // Check other label elements
        const material = label.locator('.label-material');
        await expect(material).toBeVisible();
        
        const specs = label.locator('.label-specs');
        await expect(specs).toBeVisible();
        
        const area = label.locator('.label-area');
        await expect(area).toBeVisible();
        
        const location = label.locator('.label-location');
        await expect(location).toBeVisible();
      }
    }
  });

  test('should have print and back buttons', async ({ page }) => {
    // Setup: add items to session storage
    await page.evaluate(() => {
      const offcuts = [
        {
          id: 'OC-TEST-001',
          material_name: 'Test Material',
          thickness_mm: 18,
          w_mm: 500,
          h_mm: 300,
          area_m2: 0.15,
          location: 'A1-01',
          created_at: new Date().toISOString()
        }
      ];
      sessionStorage.setItem('wh.labels', JSON.stringify(offcuts));
    });
    
    // Navigate directly to labels
    await page.goto('/ops/#/warehouse/labels');
    
    // Wait for labels to render
    await page.waitForSelector('.labels-grid', { timeout: 5000 });
    
    // Check print button exists
    const printBtn = page.locator('button').filter({ hasText: 'Imprimir' });
    await expect(printBtn).toBeVisible();
    await expect(printBtn).toHaveClass(/no-print/);
    
    // Check back button exists
    const backBtn = page.locator('button').filter({ hasText: 'Volver' });
    await expect(backBtn).toBeVisible();
    await expect(backBtn).toHaveClass(/no-print/);
    
    // Click back button
    await backBtn.click();
    
    // Should navigate back to warehouse
    await page.waitForURL('**/warehouse');
    const warehouseSection = page.locator('#warehouse-section');
    await expect(warehouseSection).toBeVisible();
  });

  test('should verify QR code content', async ({ page }) => {
    // Setup: add test offcut
    await page.evaluate(() => {
      const offcuts = [
        {
          id: 'OC-20250821-TEST',
          material_name: 'MDF Test',
          thickness_mm: 15,
          w_mm: 600,
          h_mm: 400,
          area_m2: 0.24,
          location: 'B2-03',
          created_at: '2025-08-21T10:00:00Z'
        }
      ];
      sessionStorage.setItem('wh.labels', JSON.stringify(offcuts));
    });
    
    // Navigate to labels
    await page.goto('/ops/#/warehouse/labels');
    await page.waitForSelector('.labels-grid');
    
    // Check QR code SVG exists
    const qrSvg = page.locator('.label-qr svg');
    await expect(qrSvg).toBeVisible();
    
    // Verify SVG has content (rects for QR modules)
    const rects = qrSvg.locator('rect');
    const rectCount = await rects.count();
    expect(rectCount).toBeGreaterThan(10); // QR should have multiple modules
    
    // Verify label information matches
    const labelId = page.locator('.label-id');
    await expect(labelId).toHaveText('OC-20250821-TEST');
    
    const material = page.locator('.label-material');
    await expect(material).toHaveText('MDF Test');
    
    const specs = page.locator('.label-specs');
    await expect(specs).toContainText('15mm');
    await expect(specs).toContainText('600×400mm');
    
    const area = page.locator('.label-area');
    await expect(area).toHaveText('0.240 m²');
    
    const location = page.locator('.label-location');
    await expect(location).toHaveText('B2-03');
  });

  test('should handle print styles', async ({ page }) => {
    // Setup test data
    await page.evaluate(() => {
      const offcuts = [
        { id: 'OC-001', material_name: 'Test1', thickness_mm: 18, w_mm: 500, h_mm: 300, area_m2: 0.15, location: 'A1', created_at: new Date().toISOString() },
        { id: 'OC-002', material_name: 'Test2', thickness_mm: 15, w_mm: 400, h_mm: 200, area_m2: 0.08, location: 'B1', created_at: new Date().toISOString() },
        { id: 'OC-003', material_name: 'Test3', thickness_mm: 20, w_mm: 600, h_mm: 400, area_m2: 0.24, location: 'C1', created_at: new Date().toISOString() }
      ];
      sessionStorage.setItem('wh.labels', JSON.stringify(offcuts));
    });
    
    await page.goto('/ops/#/warehouse/labels');
    await page.waitForSelector('.labels-grid');
    
    // Check print-specific classes
    const noPrintElements = page.locator('.no-print');
    const noPrintCount = await noPrintElements.count();
    expect(noPrintCount).toBeGreaterThanOrEqual(2); // Print and Back buttons
    
    // Check labels grid has correct structure for printing
    const labelsGrid = page.locator('.labels-grid');
    const gridStyle = await labelsGrid.evaluate(el => 
      window.getComputedStyle(el).gridTemplateColumns
    );
    
    // Should have 3 columns for A4 3x8 layout
    expect(gridStyle).toContain('repeat(3');
    
    // Check page-break-inside avoid on labels
    const firstLabel = page.locator('.label').first();
    const pageBreak = await firstLabel.evaluate(el => 
      window.getComputedStyle(el).pageBreakInside
    );
    expect(pageBreak).toBe('avoid');
  });
});