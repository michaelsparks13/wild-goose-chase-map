// tupper-lake-tinman.e2e.js — end-to-end checks of the editorial race page.
// Verifies the chrome renders, the page substrate is the cream paper (not
// white), the headline display font is Fraunces, and the map/sim view tabs
// still wire up correctly inside the gallery frame.

import { test, expect } from '@playwright/test';

test.describe('Tupper Lake Tinman — editorial page', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/tupper-lake-tinman/');
  });

  test('page title carries studio attribution', async ({ page }) => {
    await expect(page).toHaveTitle(/Tupper Lake Tinman.*False Summit Studio/);
  });

  test('renders all 7 universal editorial sections', async ({ page }) => {
    await expect(page.locator('.studio-mark')).toBeVisible();
    await expect(page.locator('.masthead__name')).toBeVisible();
    await expect(page.locator('.map-room__plate')).toBeVisible();
    await expect(page.locator('.disciplines')).toBeVisible();
    await expect(page.locator('.course-strip')).toBeVisible();
    await expect(page.locator('.field-notes__body')).toBeVisible();
    await expect(page.locator('.acquisition__shelf')).toBeVisible();
    await expect(page.locator('.contact-sheet__grid')).toBeVisible();
    await expect(page.locator('.colophon')).toBeVisible();
  });

  test('page substrate is warm cream paper, not pure white', async ({ page }) => {
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // #ece4d3 → rgb(236, 228, 211)
    expect(bg).toBe('rgb(236, 228, 211)');
  });

  test('headline uses Fraunces with italic accent on the proper noun', async ({ page }) => {
    const h1 = page.locator('.masthead__name');
    await expect(h1).toContainText('Tupper Lake');
    await expect(h1.locator('em')).toHaveText('Tinman');
    const fontFamily = await h1.evaluate(el => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('fraunces');
  });

  test('the map itself renders at ≥ 800px wide on desktop', async ({ page }) => {
    const box = await page.locator('#map').boundingBox();
    expect(box).toBeTruthy();
    expect(box.width).toBeGreaterThanOrEqual(800);
  });

  test('view tabs switch between map and simulator', async ({ page }) => {
    const mapTab = page.locator('.masthead__view-tabs [data-view="map"]');
    const simTab = page.locator('.masthead__view-tabs [data-view="sim"]');
    await expect(mapTab).toHaveClass(/active/);
    await simTab.click();
    await expect(simTab).toHaveClass(/active/);
    await expect(page.locator('#simView')).toHaveClass(/active/);
    await expect(page.locator('#mapView')).not.toHaveClass(/active/);
  });

  test('contact-sheet links go to the right map slugs', async ({ page }) => {
    const links = page.locator('.contact-sheet__link');
    await expect(links).toHaveCount(5);
    await expect(links.nth(0)).toHaveAttribute('href', '/maps/escarpment/');
    await expect(links.nth(3)).toHaveAttribute('href', '/maps/wild-goose/');
  });

  test('mobile viewport stacks editorial chrome and keeps masthead readable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.masthead__name')).toBeVisible();
    await expect(page.locator('.map-room__plate')).toBeVisible();
    // Disciplines stack into a single column on mobile (per editorial.css ≤ 640px)
    const discBox = await page.locator('.disciplines').boundingBox();
    expect(discBox.width).toBeLessThanOrEqual(390);
  });
});
