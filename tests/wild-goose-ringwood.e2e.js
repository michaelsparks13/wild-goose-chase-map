// wild-goose-ringwood.e2e.js — e2e coverage for the 2026 Wild Goose Trail
// Festival map at its NEW venue, Ringwood State Park (Shepherd Lake).
//
// This is a separate map from /wild-goose (Wawayanda); the original is left
// untouched and keeps its own spec (wild-goose.e2e.js). Assertions here
// encode the Ringwood deltas: seven distances (5.5 Miler → 100M, incl. 30K),
// the 17-loop 100M assembly, the removed Street View layer, the 10-file
// download set (7 distances + 3 loops), and the absence of any stale
// Wawayanda / Tinman copy.

import { test, expect } from '@playwright/test';

test.describe('Wild Goose @ Ringwood — course map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/wild-goose-ringwood/');
  });

  test('top bar carries the race mark and the Ringwood festival window', async ({ page }) => {
    await expect(page.locator('.rds-race-mark, .race-mark, header').first()).toContainText('Wild Goose');
    await expect(page.locator('body')).toContainText('Ringwood');
    await expect(page.locator('body')).toContainText('Sep 18');
  });

  test('distance picker exposes all seven 2026 Ringwood distances and starts on 50K', async ({ page }) => {
    const tabs = page.locator('.dir-race-tab');
    await expect(tabs).toHaveCount(7);
    const labels = await tabs.evaluateAll(els => els.map(e => e.getAttribute('data-race')));
    expect(labels).toEqual(['5_5m', 'half', '30k', '50k', '50m', '100k', '100m']);
    const active = page.locator('.dir-race-tab.active');
    await expect(active).toHaveAttribute('data-race', '50k');
  });

  test('each tab is labelled with its GPX-computed mileage', async ({ page }) => {
    const text = await page.locator('.dir-race-tabs').innerText();
    for (const mi of ['5.49 mi', '13.3 mi', '18.28 mi', '31.04 mi', '49.87 mi', '62.64 mi', '104.7 mi']) {
      expect(text).toContain(mi);
    }
  });

  test('selecting 100M builds the 17-loop assembly chip strip ending Pink → Blue', async ({ page }) => {
    await page.locator('.dir-race-tab[data-race="100m"]').click();
    const chips = page.locator('#assemblyStrip .assembly-chip');
    await expect(chips).toHaveCount(17);
    await expect(chips.first()).toContainText('Pink');
    await expect(chips.last()).toContainText('Blue');
    // header reflects computed distance + back-solved gain + loop count
    await expect(page.locator('#directionsRaceLabel')).toContainText('104.7 mi');
    await expect(page.locator('#directionsRaceLabel')).toContainText('10,550 ft');
    await expect(page.locator('#directionsRaceLabel')).toContainText('17 loops');
  });

  test('Layers popover offers exactly Aid / Park Trails / 3D — no Street View', async ({ page }) => {
    const rows = await page.locator('.map-layers__row-text').allInnerTexts();
    expect(rows.map(s => s.trim())).toEqual(['Aid Stations', 'Park Trails', '3D terrain']);
    // Street View checkbox + inline button are gone entirely.
    await expect(page.locator('#layerStreetview')).toHaveCount(0);
    await expect(page.locator('#streetviewBtnInline')).toHaveCount(0);
    // No turn markers exist (course is on park trails, no Street View coverage).
    await expect(page.locator('.turn-marker')).toHaveCount(0);
  });

  test('toggleStreetview is a safe no-op (shared template button is hidden, never throws)', async ({ page }) => {
    const threw = await page.evaluate(() => {
      try { window.toggleStreetview(); return false; } catch (e) { return true; }
    });
    expect(threw).toBe(false);
    // The shared race-shell .map-controls bar (which carries the hidden
    // #streetviewBtn) stays hidden for wild-goose maps.
    await expect(page.locator('.course__map > .map-controls')).toBeHidden();
  });

  test('Squatch HQ is the single loud aid surface with a no-aid-on-course strip', async ({ page }) => {
    const card = page.locator('.hq-aid-card');
    await expect(card).toContainText('Squatch HQ');
    await expect(card).toContainText("only aid station");
    await expect(page.locator('.no-aid-strip')).toContainText('No aid on course');
  });

  test('the Take-the-map-with-you block offers 10 downloads (7 distances + 3 loops)', async ({ page }) => {
    const cards = page.locator('a.download-card');
    await expect(cards).toHaveCount(10);
    const names = await cards.evaluateAll(els => els.map(a => a.getAttribute('download')));
    for (const id of ['5_5m', 'half', '30k', '50k', '50m', '100k', '100m', 'pink', 'blue', 'checkered']) {
      expect(names).toContain(`wild-goose-ringwood-${id}.gpx`);
    }
  });

  test('the WebGL map renders and carries no MapLibre nav control on the main map', async ({ page }) => {
    await page.waitForFunction(() => {
      const c = document.querySelector('#map canvas.maplibregl-canvas');
      return c && c.width > 0;
    }, null, { timeout: 10000 });
    await expect(page.locator('#map .maplibregl-ctrl-zoom-in')).toHaveCount(0);
    await expect(page.locator('#profileCanvas')).toBeAttached();
  });

  test('within-loop cues carry real Ringwood trail names, not Wawayanda turns', async ({ page }) => {
    await page.locator('.dir-race-tab[data-race="30k"]').click();
    const cueText = await page.locator('#loopCueList').innerText();
    // Enriched TBT turns surface OSM trail names from Ringwood State Park.
    expect(cueText).toMatch(/Crossover|Ringwood-Ramapo|Five Ponds|Cooper Union|Defiance|Trail/);
  });

  test('no stale cross-race copy remains in the visible page', async ({ page }) => {
    const body = await page.locator('body').innerText();
    for (const stale of ['Wawayanda', 'Hewitt, NJ', 'Tinman', 'Sprint and Olympic', 'Run leg only', 'swim leg']) {
      expect(body).not.toContain(stale);
    }
  });

  test('palette tokens: ivory paper + dark forest brand', async ({ page }) => {
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--race-brand').trim());
    const paper = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
    expect(brand.toLowerCase()).toBe('#353f1e');
    expect(paper.toUpperCase()).toBe('#FFFFF0');
  });
});

test.describe('Wild Goose @ Ringwood — mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/wild-goose-ringwood/');
  });

  test('no horizontal overflow at 375px', async ({ page }) => {
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the map is visible on the first mobile viewport', async ({ page }) => {
    const box = await page.locator('#map').boundingBox();
    expect(box).toBeTruthy();
    expect(box.y).toBeLessThan(812);
    expect(box.height).toBeGreaterThan(150);
  });

  test('all seven distance tabs are reachable on mobile', async ({ page }) => {
    await expect(page.locator('.dir-race-tab')).toHaveCount(7);
  });

  test('captures a mobile screenshot', async ({ page }, testInfo) => {
    await page.waitForTimeout(800);
    await page.screenshot({ path: testInfo.outputPath('wild-goose-ringwood-mobile.png'), fullPage: false });
  });
});
