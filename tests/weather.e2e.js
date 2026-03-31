import { test, expect } from '@playwright/test';

test.describe('Weather Intelligence - Wild Goose', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map');
  });

  test('weather cards section is visible', async ({ page }) => {
    const section = page.locator('.weather-section');
    await expect(section).toBeVisible();
  });

  test('all 4 weather cards are rendered', async ({ page }) => {
    const cards = page.locator('.weather-card');
    await expect(cards).toHaveCount(4);
  });

  test('weather cards have correct labels', async ({ page }) => {
    const section = page.locator('.weather-section');
    await expect(section).toContainText('Heat Risk');
    await expect(section).toContainText('Storm Risk');
    await expect(section).toContainText('Air Quality');
    await expect(section).toContainText('Wind');
  });

  test('risk dots have inline color styling', async ({ page }) => {
    const dots = page.locator('.risk-dot');
    await expect(dots).toHaveCount(4);
    const firstDot = dots.first();
    await expect(firstDot).toHaveAttribute('style', /background:/);
  });

  test('exposure legend is visible below elevation profile', async ({ page }) => {
    const legend = page.locator('.exposure-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Exposed');
    await expect(legend).toContainText('Partial');
    await expect(legend).toContainText('Shaded');
  });

  test('weather narrative section is visible', async ({ page }) => {
    const narrative = page.locator('.weather-narrative');
    await expect(narrative).toBeVisible();
    await expect(narrative).toContainText('WBGT');
  });

  test('elevation profile canvas is rendered', async ({ page }) => {
    const canvas = page.locator('#profileCanvas');
    await expect(canvas).toBeVisible();
  });
});

test.describe('Weather Intelligence - Escarpment (no weather data)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
  });

  test('no weather section is present', async ({ page }) => {
    const section = page.locator('.weather-section');
    await expect(section).toHaveCount(0);
  });

  test('no weather cards are present', async ({ page }) => {
    const cards = page.locator('.weather-card');
    await expect(cards).toHaveCount(0);
  });

  test('no exposure legend is present', async ({ page }) => {
    const legend = page.locator('.exposure-legend');
    await expect(legend).toHaveCount(0);
  });

  test('no weather narrative is present', async ({ page }) => {
    const narrative = page.locator('.weather-narrative');
    await expect(narrative).toHaveCount(0);
  });
});

test.describe('Weather Cards - mobile responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('weather grid uses 2 columns on mobile', async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map');
    const grid = page.locator('.weather-grid');
    const gridStyle = await grid.evaluate(el => window.getComputedStyle(el).gridTemplateColumns);
    // On mobile (375px), should be 2 columns
    const columns = gridStyle.split(' ').filter(v => v !== '');
    expect(columns.length).toBe(2);
  });
});
