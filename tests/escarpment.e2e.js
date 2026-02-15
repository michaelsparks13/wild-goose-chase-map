import { test, expect } from '@playwright/test';

test.describe('Escarpment map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/escarpment/');
    // Wait for map container to be present
    await page.waitForSelector('#map');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle('Escarpment Trail Run 30K - Course Map');
  });

  test('header shows correct race name and link', async ({ page }) => {
    const h1 = page.locator('h1');
    await expect(h1).toHaveText('Escarpment Trail Run 30K');
    const link = page.locator('.subtitle a');
    await expect(link).toHaveAttribute('href', 'https://escarpmenttrail.com');
  });

  test('toggle buttons are present with correct labels', async ({ page }) => {
    await expect(page.locator('#courseBtn')).toHaveText('Course');
    await expect(page.locator('#trailBtn')).toHaveText('Park Trails');
    await expect(page.locator('#aidBtn')).toHaveText('Aid Stations');
    await expect(page.locator('#terrainBtn')).toHaveText('3D');
  });

  test('stats section shows cutoff', async ({ page }) => {
    const stats = page.locator('.stats-section');
    await expect(stats).toContainText('6 hrs');
    await expect(stats).toContainText('Cutoff');
  });

  test('course toggle button starts active', async ({ page }) => {
    await expect(page.locator('#courseBtn')).toHaveClass(/active/);
  });

  test('trail toggle button starts inactive', async ({ page }) => {
    await expect(page.locator('#trailBtn')).not.toHaveClass(/active/);
  });

  test('clicking Park Trails button toggles active state', async ({ page }) => {
    const trailBtn = page.locator('#trailBtn');
    await trailBtn.click();
    await expect(trailBtn).toHaveClass(/active/);
    await trailBtn.click();
    await expect(trailBtn).not.toHaveClass(/active/);
  });

  test('view tabs switch between map and simulator', async ({ page }) => {
    const mapView = page.locator('#mapView');
    const simView = page.locator('#simView');
    await expect(mapView).toHaveClass(/active/);
    await expect(simView).not.toHaveClass(/active/);

    await page.locator('.view-tab', { hasText: 'Simulator' }).click();
    await expect(simView).toHaveClass(/active/);
    await expect(mapView).not.toHaveClass(/active/);
  });

  test('uses light theme background', async ({ page }) => {
    const body = page.locator('body');
    const bgColor = await body.evaluate(el => getComputedStyle(el).backgroundColor);
    // Should be white or near-white
    expect(bgColor).toMatch(/rgb\(255,\s*255,\s*255\)/);
  });

  test('aid stations button starts inactive and toggles', async ({ page }) => {
    const aidBtn = page.locator('#aidBtn');
    await expect(aidBtn).not.toHaveClass(/active/);
    await aidBtn.click();
    await expect(aidBtn).toHaveClass(/active/);
    await aidBtn.click();
    await expect(aidBtn).not.toHaveClass(/active/);
  });
});
