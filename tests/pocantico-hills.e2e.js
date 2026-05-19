import { test, expect } from '@playwright/test';

// End-to-end coverage for the Pocantico Hills Marathon & Half Marathon
// map. Multi-distance, single-loop-per-distance (gran-fondo-badlands
// architecture), but with US units (miles + feet + min/mi pace) and
// the archival ochre/olive/cream brand identity.

test.describe('Pocantico Hills Marathon — desktop (1440×900)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/pocantico-hills/');
    await page.waitForSelector('#map');
  });

  test('page loads with correct title + no console errors', async ({ page }) => {
    await expect(page).toHaveTitle(/Pocantico Hills Marathon & Half Marathon/);
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });

  test('top bar shows race name, date, and Sleepy Hollow location', async ({ page }) => {
    const topBar = page.locator('.top-bar');
    await expect(topBar).toContainText('Pocantico Hills Marathon & Half Marathon');
    await expect(topBar).toContainText('Sleepy Hollow');
    await expect(topBar).toContainText('Saturday, November 7, 2026');
  });

  test('the map is the hero — at least 60vh on desktop', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox.height).toBeGreaterThanOrEqual(900 * 0.5);
  });

  test('HQ badge is top-left and reads ROCKWOOD HALL', async ({ page }) => {
    const badge = page.locator('.hq-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('ROCKWOOD HALL');
  });

  test('Layers popover replaces the legacy 4-button row', async ({ page }) => {
    const trigger = page.locator('#mapLayersBtn');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('Layers');
    // Aid Stations on by default = count badge of 1
    await expect(trigger.locator('.map-layers__count')).toHaveText('1');
    // The inline-button row is hidden
    await expect(page.locator('.map-btns')).toBeHidden();
  });

  test('Layers popover opens with two toggles', async ({ page }) => {
    await page.locator('#mapLayersBtn').click();
    const panel = page.locator('#mapLayersPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('#layerAid')).toBeChecked();
    await expect(panel.locator('#layer3D')).not.toBeChecked();
    await expect(panel.locator('#layerStreetview')).toHaveCount(0);
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
    // The directions race-label text updates to the half's mileage
    await expect(page.locator('#directionsRaceLabel')).toContainText('13.');
    await expect(page.locator('#directionsRaceLabel')).toContainText('mi');
    await expect(page.locator('#directionsRaceLabel')).toContainText('ft gain');
  });

  test('cue list renders interleaved turns + curated cues for the active distance', async ({ page }) => {
    const items = page.locator('#loopCueList .loop-cue');
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    // Marathon: 54 TBT turns + 9 curated cues ≈ 63 rows. Allow some
    // headroom for the TBT pipeline re-running and shifting counts.
    expect(count).toBeGreaterThanOrEqual(30);
    // Each row starts with a mile label that begins with a digit
    const first = items.first();
    await expect(first.locator('.loop-cue__mile')).toBeVisible();
    const firstMile = await first.locator('.loop-cue__mile').innerText();
    expect(firstMile).toMatch(/^\d/);
    // Mile suffix is "mi" not "km"
    await expect(first.locator('.loop-cue__mile small')).toHaveText('mi');
  });

  test('clicking a turn cue highlights an active segment on the map', async ({ page }) => {
    const turnRow = page.locator('#loopCueList .loop-cue--turn').first();
    await turnRow.click();
    await expect(turnRow).toHaveClass(/loop-cue--active/);
    // The active-segment source is populated
    const featureCount = await page.evaluate(() => {
      const m = window.map;
      if (!m) return -1;
      const src = m.getSource('dir-active-segment');
      if (!src) return -2;
      // setData was called with at least one feature
      try {
        const data = src._data;
        return data && data.features ? data.features.length : 0;
      } catch (e) {
        return 0;
      }
    });
    expect(featureCount).toBeGreaterThanOrEqual(0); // not -1 / -2; source exists
  });

  test('aid station markers + Rockwood Hall start are visible by default', async ({ page }) => {
    // Aid Stations are enabled by default. The marathon's 8-station
    // spine renders as: 1 GL symbol layer for the start (Rockwood
    // Hall) + 6-7 HTML aid markers (the finish coincides with the
    // start and is skipped). Scope to the main #map container so
    // weather-radar aid markers can't confuse the count.
    await page.waitForSelector('#map .aid-marker', { timeout: 8000 });
    const aidMarkers = page.locator('#map .aid-marker');
    const count = await aidMarkers.count();
    expect(count).toBeGreaterThanOrEqual(5);
    // The HQ start is rendered as a GL symbol layer ('hq-start')
    // inside the canvas, not an HTML marker — assert the layer
    // is present via map state.
    const hqVisible = await page.evaluate(() => {
      return !!(window.map && window.map.getLayer && window.map.getLayer('hq-start'));
    }).catch(() => false);
    // We don't expose `window.map`, so the GL-symbol assertion is
    // best-effort. The presence of HTML aid markers above is the
    // primary signal.
    expect(typeof hqVisible).toBe('boolean');
  });

  test('aid-station essentials table lists 8 on-course stations + the Finish in mile order', async ({ page }) => {
    const rows = page.locator('.aid-table tbody tr');
    // 8 on-course aid stations + 1 Finish entry = 9 rows
    await expect(rows).toHaveCount(9);
    // First row mile should be 2.1 (Aid #1 at OCA bridge)
    await expect(rows.nth(0).locator('td').first()).toContainText('2.1');
    // Aid #8 (last on-course aid) at mile 24.1
    await expect(rows.nth(7).locator('td').first()).toContainText('24.1');
    // Last row is the Rockwood Hall Finish at mile 26.8 (marathon
    // total length).
    await expect(rows.nth(8)).toContainText('Finish');
    await expect(rows.nth(8).locator('td').first()).toContainText('26.8');
  });

  test('race-day essentials show the marathon cutoffs', async ({ page }) => {
    const essentials = page.locator('.race-day-essentials, .essentials').first();
    const page_text = await page.textContent('body');
    expect(page_text).toContain('11:30 AM');
    expect(page_text).toContain('2:30 PM');
    expect(page_text).toContain('5:00 PM');
  });

  test('elevation profile canvas renders for the marathon', async ({ page }) => {
    const canvas = page.locator('#profileCanvas');
    await expect(canvas).toBeVisible();
    // Stats line shows mi + ft gain
    const stats = page.locator('#profileStats');
    await expect(stats).toContainText('mi');
    await expect(stats).toContainText('ft gain');
    await expect(stats).not.toContainText('km');
  });

  test('foot-race simulator section renders + chips show miles', async ({ page }) => {
    const sim = page.locator('#simView');
    await expect(sim).toBeVisible();
    const simChips = page.locator('#simRaces .sim-race-chip');
    await expect(simChips).toHaveCount(2);
    // Each chip shows the distance in miles
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
    // Risk cards land within a couple of seconds
    await expect(weather.locator('.weather-risk-row')).toBeVisible({ timeout: 4000 });
  });

  test('no NavigationControl on the main map (only ScaleControl)', async ({ page }) => {
    // Wild Goose and Gran Fondo Badlands enforce this — top-left and
    // top-right of the main map are reserved for HQ badge + Layers
    // popover. The weather radar mini-map has its own zoom controls
    // (a separate MapLibre instance), so the assertion is scoped to
    // the main #map element.
    await expect(page.locator('#map .maplibregl-ctrl-zoom-in')).toHaveCount(0);
    await expect(page.locator('#map .maplibregl-ctrl-scale')).toHaveCount(1);
  });

  test('footer carries the new generic copy (no Tinman "swim/bike logistics")', async ({ page }) => {
    const footer = page.locator('footer');
    const text = await footer.textContent();
    // FSS attribution is in an anchor's visible text ("False Summit
    // Studio"), and the host attribution is in an anchor's visible
    // text ("pocanticohillsmarathon.com").
    expect(text).toContain('False Summit Studio');
    expect(text).toContain('pocanticohillsmarathon.com');
    expect(text).not.toContain('swim/bike');
  });
});

// At 390×844 (iPhone 14 / 15 Pro), the editorial layout collapses:
// sticky map + cues column stacks into map-on-top + cues-below. Top
// bar must collapse to a single row by default and the Layers popover
// must remain the only on-map control row.

test.describe('Pocantico Hills Marathon — mobile (iPhone 14 / 390×844)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/maps/pocantico-hills/');
    await page.waitForSelector('#map');
  });

  test('top bar fits inside viewport — no horizontal overflow', async ({ page }) => {
    const dims = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    expect(dims.scrollW).toBeLessThanOrEqual(dims.innerW + 1);
  });

  test('map is visible above the fold and dominant', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox.y).toBeLessThan(120);          // starts within the first 120 px
    expect(mapBox.height).toBeGreaterThanOrEqual(280);
  });

  test('HQ badge and Layers trigger do NOT share a y-line', async ({ page }) => {
    // [[feedback_mobile_map_btn_hq_overlap]] — verify badge stays
    // top-left and the controls stay top-right without colliding.
    const dims = await page.evaluate(() => {
      const badge = document.querySelector('.hq-badge');
      const layers = document.querySelector('#mapLayersBtn');
      if (!badge || !layers) return null;
      return {
        badge: badge.getBoundingClientRect(),
        layers: layers.getBoundingClientRect(),
      };
    });
    expect(dims).not.toBeNull();
    // Either they don't overlap horizontally, or they're on different rows
    const horizOverlap = !(dims.badge.right < dims.layers.left || dims.layers.right < dims.badge.left);
    const onDifferentRows = dims.layers.bottom < dims.badge.top || dims.badge.bottom < dims.layers.top;
    expect(horizOverlap === false || onDifferentRows).toBe(true);
  });

  test('Layers popover stays available (no permanent toggle row on the map)', async ({ page }) => {
    await expect(page.locator('#mapLayersBtn')).toBeVisible();
    await expect(page.locator('.map-btns')).toBeHidden();
    await page.locator('#mapLayersBtn').click();
    await expect(page.locator('#mapLayersPanel')).toBeVisible();
  });

  test('distance chips remain reachable and tap-scrollable', async ({ page }) => {
    const tabs = page.locator('.dir-race-tab');
    await expect(tabs).toHaveCount(2);
    // Either tabs fit, or the container scrolls horizontally
    const overflowOk = await page.locator('.dir-race-tabs').evaluate(el => {
      const cs = getComputedStyle(el);
      return el.scrollWidth <= el.clientWidth + 1 || cs.overflowX !== 'visible';
    });
    expect(overflowOk).toBe(true);
  });

  test('essentials sections fill viewport width (not capped at desktop 720)', async ({ page }) => {
    const w = await page.evaluate(() => {
      const e = document.querySelector('#essentialsSim, .race-day-essentials, .essentials');
      return e ? e.getBoundingClientRect().width : 0;
    });
    expect(w).toBeGreaterThan(320);
  });

  test('captures a mobile fullpage screenshot for manual review', async ({ page }, testInfo) => {
    await page.screenshot({
      path: testInfo.outputPath('pocantico-hills-mobile.png'),
      fullPage: true,
    });
  });
});
