// wild-goose.e2e.js — browser-level contract for the redesigned Wild
// Goose page. Verifies the editorial chrome (top bar, sticky map +
// cues split, no view-tabs), the loop-assembly UI (distance picker
// builds chip strip, chip click swaps cue list), the single-aid
// safety card, and the relocated simulator essentials section.

import { test, expect } from '@playwright/test';

test.describe('Wild Goose Trail Festival — editorial chrome', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/wild-goose/');
  });

  test('top bar carries the race mark and Sassquad festival window', async ({ page }) => {
    const raceMark = page.locator('.race-mark__name');
    await expect(raceMark).toContainText('Wild Goose Trail Festival');
    const raceDay = page.locator('.race-day-strip');
    await expect(raceDay).toContainText('Sep 18-20');
    const credit = page.locator('.studio-credit');
    await expect(credit).toBeVisible();
  });

  test('the map dominates above the fold (≥ 50vh tall, visible on first viewport)', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox.height).toBeGreaterThanOrEqual(900 * 0.5);
    expect(mapBox.y).toBeLessThan(900);
  });

  test('cue column sits beside the sticky map, not below it', async ({ page }) => {
    const mapBox  = await page.locator('.course__map').boundingBox();
    const cuesBox = await page.locator('.course__cues').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(cuesBox).toBeTruthy();
    // Side-by-side: their top edges within 80px of each other
    expect(Math.abs(mapBox.y - cuesBox.y)).toBeLessThan(80);
    // Cues to the right of the map
    expect(cuesBox.x).toBeGreaterThan(mapBox.x + mapBox.width - 20);
  });

  test('Squatch HQ aid card is the loud single-aid surface, not a one-row table', async ({ page }) => {
    const card = page.locator('.hq-aid-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Squatch HQ');
    await expect(card).toContainText("The festival's only aid station");
    // And the no-aid-on-course strip is visible right below it
    const strip = page.locator('.no-aid-strip');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('No aid on course');
  });

  test('distance picker exposes all six 2026 distances and starts on 50K', async ({ page }) => {
    const tabs = page.locator('.dir-race-tab');
    await expect(tabs).toHaveCount(6);
    const active = page.locator('.dir-race-tab.active');
    await expect(active).toHaveAttribute('data-race', '50k');
  });

  test('selecting 100M builds an assembly chip strip with 16 loop chips', async ({ page }) => {
    await page.locator('.dir-race-tab[data-race="100m"]').click();
    const chips = page.locator('.assembly-chip');
    await expect(chips).toHaveCount(16);
    // First chip should be Pink (per theme assembly)
    await expect(chips.first().locator('.assembly-chip__label')).toContainText('Pink');
  });

  test('clicking an assembly chip swaps the within-loop cue list', async ({ page }) => {
    await page.locator('.dir-race-tab[data-race="50k"]').click();
    // Default chip 0 is Pink — cue list should contain a pink-loop cue
    const cueList = page.locator('#loopCueList');
    await expect(cueList).toContainText('Trekking poles fold');
    // Click chip 2 (Blue in 50K assembly: pink, checkered, blue, pink, checkered)
    await page.locator('.assembly-chip').nth(2).click();
    await expect(cueList).toContainText('Banker Trail');
  });

  test('palette tokens come from Sassquad Wix extraction (olive + chartreuse + cream)', async ({ page }) => {
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--race-brand').trim()
    );
    expect(brand.toLowerCase()).toBe('#6a7e3d');
    const paper = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
    );
    expect(paper.toLowerCase()).toBe('#f4eee0');
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-chartreuse').trim()
    );
    expect(accent.toLowerCase()).toBe('#d4fc79');
  });

  test('weather lives in race-day essentials, not as a side panel beside the map', async ({ page }) => {
    // The new build spec moves weather out of the sticky side panel into
    // a dedicated essentials section between the simulator and aid summary.
    const weatherEssentials = page.locator('#essentialsWeather');
    await expect(weatherEssentials).toBeVisible();
    await expect(weatherEssentials).toContainText('Weather Intelligence');
    // The weather panel itself should now live inside that section, not
    // inside the .course__cues column.
    const panelInsideEssentials = page.locator('#essentialsWeather #weatherPanel');
    await expect(panelInsideEssentials).toHaveCount(1);
    const panelInsideCues = page.locator('.course__cues #weatherPanel');
    await expect(panelInsideCues).toHaveCount(0);
  });

  test('default editorial aid table is hidden (Squatch HQ aid card is the source of truth)', async ({ page }) => {
    const defaultAid = page.locator('#essentialsAid');
    await expect(defaultAid).toBeHidden();
    // But the HQ aid card in the cue column is visible.
    await expect(page.locator('.hq-aid-card')).toBeVisible();
  });

  test('simulator is surfaced as its own essentials section with 1x/2x/4x speeds', async ({ page }) => {
    const sim = page.locator('#essentialsSimulator');
    await expect(sim).toBeVisible();
    await expect(sim).toContainText('Race Simulator');
    // Goal-time inputs + scrub + speed buttons all reachable
    await expect(sim.locator('#goalHrs')).toBeVisible();
    await expect(sim.locator('#scrubTrack')).toBeVisible();
    const speeds = sim.locator('.speed-btn');
    await expect(speeds).toHaveCount(3);
    await expect(speeds.nth(0)).toContainText('1x');
    await expect(speeds.nth(1)).toContainText('2x');
    await expect(speeds.nth(2)).toContainText('4x');
  });

  test('legacy view-tab switcher is gone (editorial layout has no tabs)', async ({ page }) => {
    await expect(page.locator('.view-tabs')).toHaveCount(0);
  });
});
