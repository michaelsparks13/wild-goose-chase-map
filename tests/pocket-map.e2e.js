import { test, expect } from '@playwright/test';
import { readFileSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';

test.describe('Pocket Map button and modal UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
  });

  test('Pocket Map button is visible in header', async ({ page }) => {
    await expect(page.locator('.pocket-btn')).toBeVisible();
    await expect(page.locator('.pocket-btn')).toContainText('Pocket Map');
  });

  test('clicking Pocket Map button opens modal', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    await expect(page.locator('#pocketBackdrop')).toHaveClass(/open/);
    await expect(page.locator('.pocket-modal')).toBeVisible();
    await expect(page.locator('.pocket-modal h3')).toContainText('Save Pocket Map');
  });

  test('modal description is visible', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    await expect(page.locator('.pocket-modal-desc')).toBeVisible();
  });

  test('modal shows all three checkboxes checked by default', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    await expect(page.locator('#pocketIncludeSim')).toBeChecked();
    await expect(page.locator('#pocketIncludeElevation')).toBeChecked();
    await expect(page.locator('#pocketIncludeGPS')).toBeChecked();
  });

  test('modal shows estimated size', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    const sizeText = await page.locator('#pocketSizeEstimate').textContent();
    expect(sizeText).toMatch(/~\d+ KB/);
  });

  test('unchecking simulator reduces estimated size', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    const initialSize = await page.locator('#pocketSizeEstimate').textContent();
    await page.locator('#pocketIncludeSim').uncheck();
    const newSize = await page.locator('#pocketSizeEstimate').textContent();
    // Size should decrease when simulator is excluded
    const initial = parseInt(initialSize.replace(/\D/g, ''));
    const updated = parseInt(newSize.replace(/\D/g, ''));
    expect(updated).toBeLessThan(initial);
  });

  test('Escape key closes modal', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    await expect(page.locator('#pocketBackdrop')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pocketBackdrop')).not.toHaveClass(/open/);
  });

  test('close button closes modal', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    await page.locator('.pocket-modal-close').click();
    await expect(page.locator('#pocketBackdrop')).not.toHaveClass(/open/);
  });

  test('clicking backdrop closes modal', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    await expect(page.locator('#pocketBackdrop')).toHaveClass(/open/);
    await page.locator('#pocketBackdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#pocketBackdrop')).not.toHaveClass(/open/);
  });

  test('download button exists and is not disabled initially', async ({ page }) => {
    await page.locator('.pocket-btn').click();
    const btn = page.locator('#pocketDownloadBtn');
    await expect(btn).toBeVisible();
    await expect(btn).not.toBeDisabled();
    await expect(btn).toContainText('Download Pocket Map');
  });
});

test.describe('Pocket Map download', () => {
  test('download button triggers file download with correct name', async ({ page }) => {
    await page.goto('/maps/escarpment/');
    // Wait for map to fully load before trying to capture
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000); // allow map tiles to render

    await page.locator('.pocket-btn').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('escarpment-pocket-map.html');
  });

  test('downloaded file is valid self-contained HTML', async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000);

    await page.locator('.pocket-btn').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();
    const download = await downloadPromise;

    const filePath = await download.path();
    const html = readFileSync(filePath, 'utf-8');

    // Must be valid HTML
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');

    // Must contain race name
    expect(html).toContain('Escarpment Trail Run');

    // Must contain the map image element (snapshot or hidden placeholder)
    expect(html).toContain('pmMapImg');

    // Must NOT reference external map libraries (self-contained)
    expect(html).not.toContain('maplibre-gl.js');
    expect(html).not.toContain('pmtiles.js');
    expect(html).not.toContain('basemaps.js');

    // Must NOT reference external fonts (system fonts only)
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');

    // Must NOT reference protomaps tile assets (no external tiles)
    expect(html).not.toContain('protomaps.github.io');

    // Must contain key pocket map elements
    expect(html).toContain('pm-header');
    expect(html).toContain('pm-tabs');
    expect(html).toContain('pm-map-container');
    expect(html).toContain('pm-footer');
    expect(html).toContain('falsesummitstudio.com');
  });

  test('downloaded file contains aid station data', async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000);

    await page.locator('.pocket-btn').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();
    const download = await downloadPromise;

    const html = readFileSync(await download.path(), 'utf-8');
    expect(html).toContain('pm-aid-card');
    expect(html).toContain('Aid Stations');
  });

  test('downloaded file contains trail cue sheet', async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000);

    await page.locator('.pocket-btn').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();
    const download = await downloadPromise;

    const html = readFileSync(await download.path(), 'utf-8');
    expect(html).toContain('pm-cue-list');
    expect(html).toContain('Trail Cue Sheet');
  });

  test('downloaded file contains simulator when checked', async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000);

    await page.locator('.pocket-btn').click();
    // Ensure simulator is checked (default)
    await expect(page.locator('#pocketIncludeSim')).toBeChecked();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();
    const download = await downloadPromise;

    const html = readFileSync(await download.path(), 'utf-8');
    expect(html).toContain('Simulator');
    expect(html).toContain('pmPlayBtn');
    expect(html).toContain('pmScrubTrack');
    expect(html).toContain('pmCourseMapCanvas');
    expect(html).toContain('pmSimProfileCanvas');
  });

  test('downloaded file omits simulator when unchecked', async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000);

    await page.locator('.pocket-btn').click();
    await page.locator('#pocketIncludeSim').uncheck();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();
    const download = await downloadPromise;

    const html = readFileSync(await download.path(), 'utf-8');
    expect(html).not.toContain('pmPlayBtn');
    expect(html).not.toContain('pmCourseMapCanvas');
  });

  test('downloaded file contains GPS code when checked', async ({ page }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000);

    await page.locator('.pocket-btn').click();
    await expect(page.locator('#pocketIncludeGPS')).toBeChecked();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();
    const download = await downloadPromise;

    const html = readFileSync(await download.path(), 'utf-8');
    expect(html).toContain('pmGpsDot');
    expect(html).toContain('pmToggleGPS');
    expect(html).toContain('PM_GEO_BOUNDS');
    expect(html).toContain('navigator.geolocation');
    expect(html).toContain('Enable GPS');
  });

  test('downloaded pocket map opens and renders in browser', async ({ page, context }) => {
    await page.goto('/maps/escarpment/');
    await page.waitForSelector('#map');
    await page.waitForTimeout(2000);

    await page.locator('.pocket-btn').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#pocketDownloadBtn').click();
    const download = await downloadPromise;

    const filePath = await download.path();

    // Copy to a .html extension so the browser renders it as HTML (not plain text)
    const htmlFilePath = resolve(tmpdir(), 'pocket-map-test.html');
    copyFileSync(filePath, htmlFilePath);

    // Open the downloaded HTML file in a new page
    const pocketPage = await context.newPage();
    await pocketPage.goto('file://' + htmlFilePath);

    // Verify the pocket map renders correctly
    await expect(pocketPage.locator('.pm-header')).toBeVisible();
    await expect(pocketPage.locator('.pm-header-title')).toContainText('Escarpment Trail Run');

    // Map image element must exist (may be hidden if no WebGL snapshot was captured)
    await expect(pocketPage.locator('#pmMapImg')).toHaveCount(1);

    // Tab navigation works
    await pocketPage.locator('#pm-tab-info').click();
    await expect(pocketPage.locator('#pm-info')).toBeVisible();
    await expect(pocketPage.locator('#pm-map')).not.toBeVisible();

    // Aid stations are shown
    await expect(pocketPage.locator('.pm-aid-card').first()).toBeVisible();

    // Cue sheet is shown
    await expect(pocketPage.locator('.pm-cue-list')).toBeVisible();

    // Switch to simulator tab
    await pocketPage.locator('button', { hasText: 'Simulator' }).click();
    await expect(pocketPage.locator('#pmCourseMapCanvas')).toBeVisible();
  });
});

test.describe('Pocket Map not in embed pages', () => {
  test('embed page has no pocket button', async ({ page }) => {
    await page.goto('/embed/escarpment/');
    await page.waitForSelector('#map');
    await expect(page.locator('.pocket-btn')).toHaveCount(0);
  });

  test('embed page has no pocket modal', async ({ page }) => {
    await page.goto('/embed/escarpment/');
    await page.waitForSelector('#map');
    await expect(page.locator('#pocketBackdrop')).toHaveCount(0);
  });
});

test.describe('Pocket Map on other race maps', () => {
  test('golden-leaf has pocket map button', async ({ page }) => {
    await page.goto('/maps/golden-leaf/');
    await page.waitForSelector('#map');
    await expect(page.locator('.pocket-btn')).toBeVisible();
  });

  test('wild-goose has pocket map button (skipSharedJs map, editorial chrome)', async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map');
    // Editorial template renames the legacy .pocket-btn to the top-bar
    // utility button (race-shell.html line 48).
    const btn = page.locator('.top-bar__util-btn', { hasText: /Pocket map/i });
    await expect(btn).toBeVisible();
  });

  test('wild-goose pocket modal opens correctly', async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map');
    const btn = page.locator('.top-bar__util-btn', { hasText: /Pocket map/i });
    await btn.click();
    await expect(page.locator('#pocketBackdrop')).toHaveClass(/open/);
    await expect(page.locator('.pocket-modal h3')).toContainText('Save Pocket Map');
  });
});
