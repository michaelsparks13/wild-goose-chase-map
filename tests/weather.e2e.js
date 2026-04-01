import { test, expect } from '@playwright/test';

test.describe('Weather Intelligence - Wild Goose', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map');
  });

  test('weather panel is visible', async ({ page }) => {
    const panel = page.locator('#weatherPanel');
    await expect(panel).toBeVisible();
  });

  test('weather panel header shows Weather Intelligence', async ({ page }) => {
    const header = page.locator('.weather-panel-header');
    await expect(header).toContainText('Weather Intelligence');
  });

  test('risk cards are rendered with correct labels', async ({ page }) => {
    // Wait for weather-ui.js to render the risk cards
    await page.waitForSelector('.weather-risk-card', { timeout: 5000 });
    const cards = page.locator('.weather-risk-card');
    await expect(cards).toHaveCount(4);

    const panel = page.locator('#weatherPanel');
    await expect(panel).toContainText('Heat Stress');
    await expect(panel).toContainText('Storm Risk');
    await expect(panel).toContainText('Air Quality');
    await expect(panel).toContainText('Wind');
  });

  test('risk dots have inline color styling', async ({ page }) => {
    await page.waitForSelector('.risk-dot', { timeout: 5000 });
    const dots = page.locator('.risk-dot');
    await expect(dots).toHaveCount(4);
    const firstDot = dots.first();
    await expect(firstDot).toHaveAttribute('style', /background:/);
  });

  test('daily averages strip is rendered with 7 day cards', async ({ page }) => {
    await page.waitForSelector('.weather-day-card', { timeout: 5000 });
    const dayCards = page.locator('.weather-day-card');
    await expect(dayCards).toHaveCount(7);
  });

  test('race day card is highlighted', async ({ page }) => {
    await page.waitForSelector('.weather-day-card.race-day', { timeout: 5000 });
    const raceDay = page.locator('.weather-day-card.race-day');
    await expect(raceDay).toHaveCount(1);
  });

  test('current conditions section exists', async ({ page }) => {
    // Either loads successfully or shows error — either way the container exists
    await page.waitForSelector('#weatherCurrent', { timeout: 5000 });
    const current = page.locator('#weatherCurrent');
    await expect(current).toBeVisible();
  });

  test('heat stress explainer is present', async ({ page }) => {
    await page.waitForSelector('.weather-explainer', { timeout: 5000 });
    const explainer = page.locator('.weather-explainer');
    await expect(explainer).toContainText('Heat Stress Index');
    await expect(explainer).toContainText('humidity');
  });

  test('does NOT contain WBGT anywhere', async ({ page }) => {
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('WBGT');
  });

  test('elevation profile canvas is rendered', async ({ page }) => {
    const canvas = page.locator('#profileCanvas');
    await expect(canvas).toBeVisible();
  });

  test('no exposure legend is present', async ({ page }) => {
    const legend = page.locator('.exposure-legend');
    await expect(legend).toHaveCount(0);
  });

  test('no Race Day Weather section is present', async ({ page }) => {
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Race Day Weather');
  });
});

test.describe('Weather Intelligence - Escarpment (no weather data)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
  });

  test('no weather panel is present', async ({ page }) => {
    const panel = page.locator('#weatherPanel');
    await expect(panel).toHaveCount(0);
  });

  test('no weather risk cards are present', async ({ page }) => {
    const cards = page.locator('.weather-risk-card');
    await expect(cards).toHaveCount(0);
  });

  test('layout wrapper is still present', async ({ page }) => {
    const layout = page.locator('.map-weather-layout');
    await expect(layout).toBeVisible();
  });
});

test.describe('Weather Panel - mobile responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('weather panel is above map on mobile', async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map');
    const panel = page.locator('#weatherPanel');
    await expect(panel).toBeVisible();

    // Panel should have order: -1 on mobile (rendered above map)
    const panelOrder = await panel.evaluate(el => window.getComputedStyle(el).order);
    expect(panelOrder).toBe('-1');
  });

  test('weather panel can be collapsed on mobile', async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map');

    const header = page.locator('.weather-panel-header');
    const body = page.locator('#weatherPanelBody');

    // Click to collapse
    await header.click();
    await expect(body).toHaveClass(/collapsed/);

    // Click to expand
    await header.click();
    await expect(body).not.toHaveClass(/collapsed/);
  });

  test('risk cards use 2 columns on small mobile', async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('.weather-risk-card', { timeout: 5000 });
    const grid = page.locator('.weather-risk-row');
    const gridStyle = await grid.evaluate(el => window.getComputedStyle(el).gridTemplateColumns);
    const columns = gridStyle.split(' ').filter(v => v !== '');
    expect(columns.length).toBe(2);
  });
});
