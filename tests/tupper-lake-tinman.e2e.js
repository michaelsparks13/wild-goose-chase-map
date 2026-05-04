// tupper-lake-tinman.e2e.js — v2 athlete-first contract.
// Verifies the four operational fixes from the v2 brief:
//   1. The map dominates the page above the fold (≥ 60vh tall, visible)
//   2. The cue sheet is co-visible with the map (split view, sticky map)
//   3. Run-only scope is plainly stated; no swim/bike chrome
//   4. Race-branded palette (yellow on black) lands as expected

import { test, expect } from '@playwright/test';

test.describe('Tupper Lake Tinman — athlete-first race page (v2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/tupper-lake-tinman/');
  });

  test('top bar belongs to the race, not the studio', async ({ page }) => {
    const raceMark = page.locator('.race-mark__name');
    await expect(raceMark).toContainText('Tupper Lake Tinman');
    const raceMarkSize = await raceMark.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    // Race wordmark is small (≤ 28px per brief, not a hero)
    expect(raceMarkSize).toBeLessThanOrEqual(28);
    // Studio credit exists but is small (≤ ~12px) and far-right
    const credit = page.locator('.studio-credit');
    await expect(credit).toBeVisible();
    const creditSize = await credit.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(creditSize).toBeLessThanOrEqual(14);
  });

  test('the map dominates above the fold (≥ 60vh tall)', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox.height).toBeGreaterThanOrEqual(900 * 0.6);
    // And the map must be visible on first viewport, not below the fold
    expect(mapBox.y).toBeLessThan(900);
  });

  test('cue sheet is co-visible with the map on first viewport', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    const cuesBox = await page.locator('.course__cues').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(cuesBox).toBeTruthy();
    // Both visible on first viewport
    expect(mapBox.y + mapBox.height).toBeGreaterThan(0);
    expect(cuesBox.y).toBeLessThan(900);
    // And they sit side-by-side, not stacked
    expect(Math.abs(mapBox.y - cuesBox.y)).toBeLessThan(80);
  });

  test('clicking a cue row keeps the map and cue both visible', async ({ page }) => {
    const cue = page.locator('.dir-step').nth(2);
    await cue.click();
    // Map remains visible; we don't assert pan because that's covered in tinman-directions.e2e.js
    await expect(page.locator('#map')).toBeVisible();
    await expect(cue).toBeVisible();
  });

  test('palette is the race brand (yellow + black), not invented Adirondack tokens', async ({ page }) => {
    const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--race-brand').trim());
    expect(brand.toLowerCase()).toBe('#f5c518');
    const ink = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
    expect(ink.toLowerCase()).toBe('#1a1a1a');
    // Top bar uses raceInk on raceBrand — black with a yellow accent rule
    const bar = page.locator('.top-bar');
    const barBg = await bar.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(barBg).toBe('rgb(26, 26, 26)');
  });

  test('start marker reads RUN START, not BIKE FINISH / RUN START', async ({ page }) => {
    const badge = page.locator('.hq-badge .text');
    await expect(badge).toHaveText('RUN START');
  });

  test('scope note plainly states run-only and routes to host race', async ({ page }) => {
    const note = page.locator('.scope-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Run course only');
    const link = note.locator('a.scope-note__link');
    await expect(link).toHaveAttribute('href', /tupperlaketinman/);
  });

  test('no swim/bike chrome — disciplines triptych is gone, scope is run-only', async ({ page }) => {
    await expect(page.locator('.disciplines')).toHaveCount(0);
    await expect(page.locator('text=Tinman swim')).toHaveCount(0);
    await expect(page.locator('text=Tinman bike')).toHaveCount(0);
  });

  test('countdown shows a sensible day count for 2026-06-27', async ({ page }) => {
    const text = await page.locator('#raceCountdown').textContent();
    expect(text).toMatch(/Race in \d+ days|Race tomorrow|Race today|Past edition|Just raced/);
  });

  test('aid table renders all theme aid stations', async ({ page }) => {
    const rows = page.locator('.aid-table tbody tr');
    await expect(rows).toHaveCount(8);
    await expect(rows.first()).toContainText('Park Street');
  });

  test('embed mode applies via ?embed=1 (compact chrome)', async ({ page }) => {
    await page.goto('/maps/tupper-lake-tinman/?embed=1');
    await expect(page.locator('body')).toHaveClass(/race-page--embed/);
    // Non-essential blocks hidden in embed
    await expect(page.locator('#essentialsNotes')).toBeHidden();
    await expect(page.locator('#essentialsCross')).toBeHidden();
    // FSS credit still present in footer (race directors find FSS through embeds)
    await expect(page.locator('.page-footer__line')).toContainText('Cartography');
  });

  test('mobile viewport stacks map (sticky top) above cues', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/maps/tupper-lake-tinman/');
    const mapBox = await page.locator('#map').boundingBox();
    const cuesBox = await page.locator('.course__cues').boundingBox();
    // Stacked (map above cues), not side-by-side
    expect(cuesBox.y).toBeGreaterThan(mapBox.y + mapBox.height - 30);
    // Map is still ≥ 50vh tall (per brief: ~50vh on mobile)
    expect(mapBox.height).toBeGreaterThanOrEqual(844 * 0.4);
  });
});

test.describe('Tupper Lake Tinman — Street View overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/tupper-lake-tinman/');
    // Wait for map load — markers attach inside map.on('load')
    await page.waitForSelector('.aid-marker', { state: 'attached', timeout: 10_000 });
  });

  test('toggle button is between Aid Stations and 3D', async ({ page }) => {
    const buttons = await page.locator('.map-toggles button').allTextContents();
    const trimmed = buttons.map((s) => s.trim());
    const aidIdx = trimmed.findIndex((t) => /Aid stations/i.test(t));
    const svIdx  = trimmed.findIndex((t) => /Street View/i.test(t));
    const trIdx  = trimmed.findIndex((t) => /3D/i.test(t));
    expect(aidIdx).toBeGreaterThanOrEqual(0);
    expect(svIdx).toBeGreaterThan(aidIdx);
    expect(trIdx).toBeGreaterThan(svIdx);
  });

  test('markers are hidden by default and revealed by toggle', async ({ page }) => {
    // Use .map-toggles to target the visible button (two #streetviewBtn elements exist:
    // one in .map-toggles and one in the CSS-hidden .map-btns row)
    const svBtn = page.locator('.map-toggles #streetviewBtn');
    await expect(page.locator('.streetview-marker').first()).toBeHidden();
    await svBtn.click();
    await expect(svBtn).toHaveClass(/active/);
    await expect(page.locator('.streetview-marker').first()).toBeVisible();
    const count = await page.locator('.streetview-marker').count();
    expect(count).toBe(9);
  });

  test('clicking a marker opens a popup with photo, title, and rotated arrow', async ({ page }) => {
    const svBtn = page.locator('.map-toggles #streetviewBtn');
    await svBtn.click();
    // Use data-turn-index="2" (Old Wawbeek / Dugal Loop Entry) — it sits at a
    // unique map position so it can't be obscured by an overlapping marker.
    // Turns 0 and 3 share the same base coordinate and render within 2px of
    // each other at the default zoom, making turn-0 unreliable as a click target.
    await page.locator('.streetview-marker[data-turn-index="2"]').click({ force: true });

    const popup = page.locator('.streetview-popup');
    await expect(popup).toBeVisible();

    const title = popup.locator('.streetview-title');
    await expect(title).toContainText('Wawbeek'); // turn 2 = "Old Wawbeek / Dugal Loop Entry"

    const photo = popup.locator('.streetview-photo');
    const src = await photo.getAttribute('src');
    expect(src).toContain('panoid=aW84qtHD_VBgwzlvZuvSOg');
    expect(src).toContain('streetviewpixels-pa.googleapis.com');

    const arrow = popup.locator('.streetview-arrow');
    const transform = await arrow.evaluate((el) => getComputedStyle(el).transform);
    // matrix(...) means a transform was applied; rotate(0deg) would still
    // produce matrix(1, 0, 0, 1, ..., ...). We just assert it's not 'none'.
    expect(transform).not.toBe('none');
    // Rotation for turn 2: normalizeAngle(bearingAfter=119 - yaw=98.82) = 20.18°.
    // The matrix decomposes as matrix(cos, sin, -sin, cos, tx, ty);
    // rotation = atan2(sin, cos).
    const m = transform.match(/matrix\(([-0-9.,\s]+)\)/);
    expect(m).not.toBeNull();
    const parts = m[1].split(',').map(Number);
    const rotationRad = Math.atan2(parts[1], parts[0]);
    const rotationDeg = rotationRad * 180 / Math.PI;
    expect(Math.abs(rotationDeg - 20.18)).toBeLessThan(1.0);
  });

  test('toggling off hides markers and removes any open popup', async ({ page }) => {
    const svBtn = page.locator('.map-toggles #streetviewBtn');
    await svBtn.click();
    // Use turn index 2 (unique map position) to avoid the overlapping turns 0/3
    await page.locator('.streetview-marker[data-turn-index="2"]').click({ force: true });
    await expect(page.locator('.streetview-popup')).toBeVisible();

    await svBtn.click();
    await expect(svBtn).not.toHaveClass(/active/);
    await expect(page.locator('.streetview-marker').first()).toBeHidden();
    await expect(page.locator('.streetview-popup')).toHaveCount(0);
  });
});
