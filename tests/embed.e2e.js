import { test, expect } from '@playwright/test';

test.describe('Embed widget rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/embed/escarpment/');
    await page.waitForSelector('#map');
  });

  test('renders without site header or footer', async ({ page }) => {
    await expect(page.locator('.header')).toHaveCount(0);
    await expect(page.locator('.footer')).toHaveCount(0);
    await expect(page.locator('.page-shell')).toHaveCount(0);
  });

  test('has compact embed header', async ({ page }) => {
    await expect(page.locator('.embed-header')).toBeVisible();
    await expect(page.locator('.embed-title')).toContainText('Escarpment Trail Run 30K');
  });

  test('shows powered-by link', async ({ page }) => {
    const poweredBy = page.locator('.powered-by');
    await expect(poweredBy).toContainText('Powered by False Summit Studio');
    await expect(poweredBy).toHaveAttribute('href', 'https://falsesummitstudio.com');
  });

  test('map container is visible', async ({ page }) => {
    await expect(page.locator('#map')).toBeVisible();
  });

  test('map fills available width', async ({ page }) => {
    const mapWidth = await page.locator('#map').evaluate(el => el.offsetWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(mapWidth).toBeGreaterThan(viewportWidth * 0.95);
  });

  test('toggle buttons are present', async ({ page }) => {
    await expect(page.locator('#courseBtn')).toBeVisible();
    await expect(page.locator('#terrainBtn')).toBeVisible();
  });

  test('view tabs switch between map and simulator', async ({ page }) => {
    const mapView = page.locator('#mapView');
    const simView = page.locator('#simView');
    await expect(mapView).toHaveClass(/active/);

    await page.locator('.view-tab', { hasText: 'Simulator' }).click();
    await expect(simView).toHaveClass(/active/);
    await expect(mapView).not.toHaveClass(/active/);

    await page.locator('.view-tab', { hasText: 'Map' }).click();
    await expect(mapView).toHaveClass(/active/);
  });
});

test.describe('Embed URL parameters', () => {
  test('accent parameter overrides primary color', async ({ page }) => {
    await page.goto('/embed/escarpment/?accent=FF6B35');
    await page.waitForSelector('#map');
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    );
    expect(primary).toBe('#FF6B35');
  });

  test('hide=simulator removes sim tabs', async ({ page }) => {
    await page.goto('/embed/escarpment/?hide=simulator');
    await page.waitForSelector('#map');
    await expect(page.locator('.embed-tabs')).not.toBeVisible();
  });

  test('hide=stats hides stats section', async ({ page }) => {
    await page.goto('/embed/escarpment/?hide=stats');
    await page.waitForSelector('#map');
    await expect(page.locator('.stats-section')).not.toBeVisible();
  });

  test('hide=elevation hides profile section', async ({ page }) => {
    await page.goto('/embed/escarpment/?hide=elevation');
    await page.waitForSelector('#map');
    await expect(page.locator('.profile-section')).not.toBeVisible();
  });

  test('height=compact hides stats, profile, and description', async ({ page }) => {
    await page.goto('/embed/escarpment/?height=compact');
    await page.waitForSelector('#map');
    await expect(page.locator('.stats-section')).not.toBeVisible();
    await expect(page.locator('.profile-section')).not.toBeVisible();
  });

  test('theme=dark applies dark colors', async ({ page }) => {
    await page.goto('/embed/escarpment/?theme=dark');
    await page.waitForSelector('#map');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    );
    expect(bg).toBe('#1a1a2e');
  });

  test('show=map,elevation hides simulator and stats', async ({ page }) => {
    await page.goto('/embed/escarpment/?show=map,elevation');
    await page.waitForSelector('#map');
    await expect(page.locator('.embed-tabs')).not.toBeVisible();
    await expect(page.locator('.stats-section')).not.toBeVisible();
    await expect(page.locator('.profile-section')).toBeVisible();
  });
});

test.describe('Embed iframe integration', () => {
  test('loads correctly inside an iframe', async ({ page }) => {
    await page.setContent(`
      <html><body style="margin:0">
        <h1>Race Website</h1>
        <iframe id="mapFrame" src="http://localhost:3000/embed/escarpment/"
                width="100%" height="600" style="border:none;border-radius:8px;"
                loading="lazy" allow="geolocation"></iframe>
      </body></html>
    `);
    const frame = page.frameLocator('#mapFrame');
    await expect(frame.locator('.embed-header')).toBeVisible({ timeout: 15000 });
    await expect(frame.locator('#map')).toBeVisible();
    await expect(frame.locator('.powered-by')).toBeVisible();
  });
});
