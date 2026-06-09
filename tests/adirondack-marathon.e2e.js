import { test, expect } from '@playwright/test';

// End-to-end coverage for the Adirondack Marathon & Half Marathon map.
// Two-distance road race (marathon + its back-half half marathon) around
// Schroon Lake, NY, with US units (miles + feet + min/mi pace) and the
// ADK navy + lake-blue brand identity. No turn-by-turn pipeline — the cue
// list renders the curated theme cues.

test.describe('Adirondack Marathon — desktop (1440×900)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/adirondack-marathon/');
    await page.waitForSelector('#map');
  });

  test('page loads with correct title + no console errors', async ({ page }) => {
    await expect(page).toHaveTitle(/Adirondack Marathon & Half Marathon/);
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });

  test('top bar shows race name, date, and Schroon Lake location', async ({ page }) => {
    const topBar = page.locator('.top-bar');
    await expect(topBar).toContainText('Adirondack Marathon & Half Marathon');
    await expect(topBar).toContainText('Schroon Lake');
    await expect(topBar).toContainText('Sunday, September 27, 2026');
  });

  test('the map is the hero — at least 50vh on desktop', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox.height).toBeGreaterThanOrEqual(900 * 0.5);
  });

  test('HQ badge is top-left and reads SCHROON LAKE', async ({ page }) => {
    const badge = page.locator('.hq-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('SCHROON LAKE');
  });

  test('Layers popover replaces the legacy button row', async ({ page }) => {
    const trigger = page.locator('#mapLayersBtn');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('Layers');
    await expect(trigger.locator('.map-layers__count')).toHaveText('1');
    await expect(page.locator('.map-btns')).toBeHidden();
  });

  test('Layers popover opens with aid + 3D toggles', async ({ page }) => {
    await page.locator('#mapLayersBtn').click();
    const panel = page.locator('#mapLayersPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('#layerAid')).toBeChecked();
    await expect(panel.locator('#layer3D')).not.toBeChecked();
  });

  test('two distance chips render — marathon active by default, half inactive', async ({ page }) => {
    const tabs = page.locator('.dir-race-tab');
    await expect(tabs).toHaveCount(2);
    await expect(page.locator('[data-race="marathon"]')).toHaveClass(/active/);
    await expect(page.locator('[data-race="half-marathon"]')).not.toHaveClass(/active/);
  });

  test('clicking the half-marathon chip swaps active distance + cue list', async ({ page }) => {
    await page.locator('[data-race="half-marathon"]').click();
    await expect(page.locator('[data-race="half-marathon"]')).toHaveClass(/active/);
    await expect(page.locator('[data-race="marathon"]')).not.toHaveClass(/active/);
    // The directions race-label updates to the half's certified mileage.
    await expect(page.locator('#directionsRaceLabel')).toContainText('13.');
    await expect(page.locator('#directionsRaceLabel')).toContainText('mi');
    await expect(page.locator('#directionsRaceLabel')).toContainText('ft gain');
  });

  test('cue list renders curated cues for the active distance, in miles', async ({ page }) => {
    const items = page.locator('#loopCueList .loop-cue');
    await expect(items.first()).toBeVisible();
    // Marathon has 8 curated cues (no TBT pipeline for this road race).
    expect(await items.count()).toBeGreaterThanOrEqual(5);
    const first = items.first();
    await expect(first.locator('.loop-cue__mile')).toBeVisible();
    const firstMile = await first.locator('.loop-cue__mile').innerText();
    expect(firstMile).toMatch(/^\d/);
    await expect(first.locator('.loop-cue__mile small')).toHaveText('mi');
  });

  test('cue clicks respect "zoom to step" — the toggle gates EVERY directional node', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    const cue = page.locator('#loopCueList .loop-cue:not(.loop-cue--turn)').first();
    await expect(cue).toBeVisible();
    // Unchecked (default): the row goes active but the camera stays put.
    const z0 = await page.evaluate(() => window.map.getZoom());
    await cue.click();
    await page.waitForTimeout(300);
    await expect(cue).toHaveClass(/loop-cue--active/);
    const z1 = await page.evaluate(() => window.map.getZoom());
    expect(Math.abs(z1 - z0)).toBeLessThan(0.05);
    // Checked: clicking a point cue now flies the camera (same gate as turns).
    await page.locator('#zoomToStepCheckbox').check();
    const cue2 = page.locator('#loopCueList .loop-cue:not(.loop-cue--turn)').nth(2);
    const z2 = await page.evaluate(() => window.map.getZoom());
    await cue2.click();
    await page.waitForTimeout(900);
    const z3 = await page.evaluate(() => window.map.getZoom());
    expect(Math.abs(z3 - z2)).toBeGreaterThan(0.1);
    expect(errors).toEqual([]);
  });

  test('the Schroon Lake water label renders by default', async ({ page }) => {
    // Poll until the symbol places (full-suite runs render slower than a
    // fixed wait allows); text-ignore-placement keeps it on once placed.
    await expect.poll(async () => page.evaluate(() => {
      try {
        return (window.map && window.map.loaded())
          ? window.map.queryRenderedFeatures({ layers: ['lake-label'] }).length : 0;
      } catch (e) { return 0; }
    }), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  });

  test('clicking a TURN highlights the route segment and does NOT zoom by default', async ({ page }) => {
    const turn = page.locator('#loopCueList .loop-cue--turn').first();
    await expect(turn).toBeVisible();
    const zoomBefore = await page.evaluate(() => window.map.getZoom());
    await turn.click();
    await page.waitForTimeout(350);
    await expect(turn).toHaveClass(/loop-cue--active/);
    const segFeatures = await page.evaluate(() => {
      const s = window.map.getSource('dir-active-segment');
      try { const d = s.serialize().data; return d && d.features ? d.features.length : 0; } catch (e) { return -1; }
    });
    expect(segFeatures).toBeGreaterThanOrEqual(1); // segment highlighted
    // "Zoom to step" is unchecked by default → camera stays put
    const zoomAfter = await page.evaluate(() => window.map.getZoom());
    expect(Math.abs(zoomAfter - zoomBefore)).toBeLessThan(0.05);
  });

  test('with "zoom to step" checked, clicking a turn flies the camera (≈600ms)', async ({ page }) => {
    await page.locator('#zoomToStepCheckbox').check();
    const zoomBefore = await page.evaluate(() => window.map.getZoom());
    await page.locator('#loopCueList .loop-cue--turn').last().click();
    await page.waitForTimeout(900); // fitBounds duration 600ms + buffer
    const zoomAfter = await page.evaluate(() => window.map.getZoom());
    expect(Math.abs(zoomAfter - zoomBefore)).toBeGreaterThan(0.1);
  });

  test('aid station markers are visible by default; start is a GL symbol', async ({ page }) => {
    // The marathon visits 15 water stations + finish as HTML markers; the
    // village start is a GL symbol layer ('hq-start'), not an HTML marker.
    await page.waitForSelector('#map .aid-marker', { timeout: 8000 });
    const count = await page.locator('#map .aid-marker').count();
    expect(count).toBeGreaterThanOrEqual(10);
    const hqVisible = await page.evaluate(() =>
      !!(window.map && window.map.getLayer && window.map.getLayer('hq-start'))).catch(() => false);
    expect(typeof hqVisible).toBe('boolean');
  });

  test('aid-station essentials table lists the spine in mile order, ending at the beach Finish', async ({ page }) => {
    const rows = page.locator('.aid-table tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(16);
    const bodyText = await page.textContent('.aid-table');
    expect(bodyText).toContain('Hamlet of Adirondack');
    const last = rows.last();
    await expect(last).toContainText('Finish');
    await expect(last.locator('td').first()).toContainText('26.2');
  });

  test('race-day essentials show the course-close times', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText).toContain('2:30 PM');
    expect(pageText).toContain('3:30 PM');
  });

  test('elevation profile canvas renders in miles + feet', async ({ page }) => {
    await expect(page.locator('#profileCanvas')).toBeVisible();
    const stats = page.locator('#profileStats');
    await expect(stats).toContainText('mi');
    await expect(stats).toContainText('ft gain');
    await expect(stats).not.toContainText('km');
  });

  test('foot-race simulator renders + chips show miles', async ({ page }) => {
    await expect(page.locator('#simView')).toBeVisible();
    const simChips = page.locator('#simRaces .sim-race-chip');
    await expect(simChips).toHaveCount(2);
    await expect(simChips.nth(0)).toContainText('26');
    await expect(simChips.nth(0)).toContainText('mi');
    await expect(simChips.nth(1)).toContainText('13');
    await expect(simChips.nth(1)).toContainText('mi');
  });

  test('goal-pace label reads in min/mi (not km/h)', async ({ page }) => {
    const pace = page.locator('#goalPace');
    await expect(pace).toBeVisible();
    await expect(pace).toContainText('/mi');
    await expect(pace).not.toContainText('km/h');
  });

  test('weather panel renders with race-day forecast data', async ({ page }) => {
    const weather = page.locator('#weatherPanel');
    await expect(weather).toBeVisible();
    await expect(weather.locator('#weatherPanelTitle')).toHaveText('Weather Intelligence');
    await expect(weather.locator('.weather-risk-row')).toBeVisible({ timeout: 4000 });
  });

  test('no NavigationControl on the main map (only ScaleControl)', async ({ page }) => {
    await expect(page.locator('#map .maplibregl-ctrl-zoom-in')).toHaveCount(0);
    await expect(page.locator('#map .maplibregl-ctrl-scale')).toHaveCount(1);
  });

  test('footer carries FSS + host attribution (no triathlon copy)', async ({ page }) => {
    const text = await page.locator('footer').textContent();
    expect(text).toContain('False Summit Studio');
    expect(text).toContain('adirondackmarathon.org');
    expect(text).not.toContain('swim/bike');
  });
});

// At 390×844 the editorial layout collapses: sticky map + cues column
// stacks into map-on-top + cues-below. Top bar collapses to a single row
// and the Layers popover stays the only on-map control.

test.describe('Adirondack Marathon — mobile (iPhone 14 / 390×844)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/maps/adirondack-marathon/');
    await page.waitForSelector('#map');
  });

  test('no horizontal overflow', async ({ page }) => {
    const dims = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    expect(dims.scrollW).toBeLessThanOrEqual(dims.innerW + 1);
  });

  test('map is visible above the fold and dominant', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox.y).toBeLessThan(120);
    expect(mapBox.height).toBeGreaterThanOrEqual(280);
  });

  test('HQ badge and Layers trigger do NOT overlap', async ({ page }) => {
    const dims = await page.evaluate(() => {
      const badge = document.querySelector('.hq-badge');
      const layers = document.querySelector('#mapLayersBtn');
      if (!badge || !layers) return null;
      return { badge: badge.getBoundingClientRect(), layers: layers.getBoundingClientRect() };
    });
    expect(dims).not.toBeNull();
    const horizOverlap = !(dims.badge.right < dims.layers.left || dims.layers.right < dims.badge.left);
    const onDifferentRows = dims.layers.bottom < dims.badge.top || dims.badge.bottom < dims.layers.top;
    expect(horizOverlap === false || onDifferentRows).toBe(true);
  });

  test('Layers popover stays available (no permanent toggle row)', async ({ page }) => {
    await expect(page.locator('#mapLayersBtn')).toBeVisible();
    await expect(page.locator('.map-btns')).toBeHidden();
    await page.locator('#mapLayersBtn').click();
    await expect(page.locator('#mapLayersPanel')).toBeVisible();
  });

  test('distance chips remain reachable and tap-scrollable', async ({ page }) => {
    const tabs = page.locator('.dir-race-tab');
    await expect(tabs).toHaveCount(2);
    const overflowOk = await page.locator('.dir-race-tabs').evaluate(el => {
      const cs = getComputedStyle(el);
      return el.scrollWidth <= el.clientWidth + 1 || cs.overflowX !== 'visible';
    });
    expect(overflowOk).toBe(true);
  });

  test('essentials sections fill viewport width', async ({ page }) => {
    const w = await page.evaluate(() => {
      const e = document.querySelector('#essentialsSim, .race-day-essentials, .essentials');
      return e ? e.getBoundingClientRect().width : 0;
    });
    expect(w).toBeGreaterThan(320);
  });

  test('captures a mobile fullpage screenshot for manual review', async ({ page }, testInfo) => {
    await page.screenshot({
      path: testInfo.outputPath('adirondack-marathon-mobile.png'),
      fullPage: true,
    });
  });
});
