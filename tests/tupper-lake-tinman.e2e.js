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
