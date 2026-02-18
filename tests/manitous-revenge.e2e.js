const { test, expect } = require('@playwright/test');

test.describe("Manitou's Revenge map", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/manitous-revenge/');
    await page.waitForSelector('#map');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Manitou.*Revenge/);
  });

  test('header displays race name', async ({ page }) => {
    const header = page.locator('h1');
    await expect(header).toContainText("Manitou's Revenge");
  });

  test('header has external race link', async ({ page }) => {
    const link = page.locator('.header a[target="_blank"]');
    await expect(link).toHaveAttribute('href', 'https://www.manitousrevengeultra.com');
  });

  test('toggle buttons are present with correct labels', async ({ page }) => {
    await expect(page.locator('#courseBtn')).toHaveText('Course');
    await expect(page.locator('#trailBtn')).toHaveText('Park Trails');
    await expect(page.locator('#aidBtn')).toHaveText('Aid Stations');
    await expect(page.locator('#terrainBtn')).toHaveText('3D');
  });

  test('stats section shows correct values', async ({ page }) => {
    const stats = page.locator('.stats-section');
    await expect(stats).toContainText('53.2');
    await expect(stats).toContainText('15,000+');
    await expect(stats).toContainText('23 hrs');
    await expect(stats).toContainText('Point-to-Point');
  });

  test('Course button is active on load', async ({ page }) => {
    await expect(page.locator('#courseBtn')).toHaveClass(/active/);
  });

  test('Park Trails button is inactive on load', async ({ page }) => {
    await expect(page.locator('#trailBtn')).not.toHaveClass(/active/);
  });

  test('clicking Park Trails button toggles active state', async ({ page }) => {
    const trailBtn = page.locator('#trailBtn');
    await trailBtn.click();
    await expect(trailBtn).toHaveClass(/active/);
    await trailBtn.click();
    await expect(trailBtn).not.toHaveClass(/active/);
  });

  test('clicking Aid Stations button toggles active state', async ({ page }) => {
    const aidBtn = page.locator('#aidBtn');
    await aidBtn.click();
    await expect(aidBtn).toHaveClass(/active/);
  });

  test('view tabs switch between map and simulator', async ({ page }) => {
    const mapTab = page.locator('[data-view="map"]');
    const simTab = page.locator('[data-view="sim"]');
    await simTab.click();
    const simView = page.locator('#simView');
    await expect(simView).toBeVisible();
    await mapTab.click();
    const mapView = page.locator('#mapView');
    await expect(mapView).toBeVisible();
  });

  test('has dark theme background', async ({ page }) => {
    const body = page.locator('body');
    const bgColor = await body.evaluate(el => getComputedStyle(el).backgroundColor);
    // Dark theme: rgb values should all be very low
    const match = bgColor.match(/rgb\((\d+), (\d+), (\d+)\)/);
    if (match) {
      expect(parseInt(match[1])).toBeLessThan(30);
      expect(parseInt(match[2])).toBeLessThan(30);
      expect(parseInt(match[3])).toBeLessThan(30);
    }
  });

  test('course description mentions Long Path and Catskills', async ({ page }) => {
    const desc = page.locator('.course-description');
    await expect(desc).toContainText('Long Path');
    await expect(desc).toContainText('Catskill');
  });
});
