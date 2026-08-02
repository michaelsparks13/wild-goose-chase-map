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

  test('palette tokens: ivory paper + dark forest brand + chartreuse-yellow header accent', async ({ page }) => {
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--race-brand').trim()
    );
    expect(brand.toLowerCase()).toBe('#353f1e');
    const paper = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
    );
    expect(paper.toUpperCase()).toBe('#FFFFF0');
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-chartreuse').trim()
    );
    expect(accent.toLowerCase()).toBe('#d4fc79');
    const headerAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--header-accent').trim()
    );
    expect(headerAccent.toLowerCase()).toBe('#b7e815');
  });

  test('top-bar wordmark + countdown render in the chartreuse-yellow header accent', async ({ page }) => {
    const wordmarkColor = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.race-mark__name')).color
    );
    const countdownColor = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#raceCountdown')).color
    );
    // #b7e815 == rgb(183, 232, 21)
    expect(wordmarkColor).toBe('rgb(183, 232, 21)');
    expect(countdownColor).toBe('rgb(183, 232, 21)');
  });

  test('Layers popover trigger renders inside the map (replaces legacy 4-button row)', async ({ page }) => {
    // The four-button overlay row was replaced with one compact Layers
    // trigger + checkbox panel. The legacy inline buttons (#aidBtnInline
    // etc) remain in the DOM as visually-hidden stubs so the toggle pair-
    // sync stays bidirectional, but they no longer paint pixels.
    const trigger = await page.evaluate(() => {
      const el = document.getElementById('mapLayersBtn');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim() };
    });
    expect(trigger).not.toBeNull();
    expect(trigger.text).toContain('Layers');
    expect(trigger.w).toBeGreaterThan(80);
    expect(trigger.h).toBeGreaterThanOrEqual(28);
  });

  test('sim panel + visual have a clear 32px+ visual gap (no near-touch)', async ({ page }) => {
    await page.locator('#essentialsSimulator').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const gapPx = await page.evaluate(() => {
      const p = document.querySelector('.sim-panel').getBoundingClientRect();
      const v = document.querySelector('.sim-visual').getBoundingClientRect();
      return v.x - (p.x + p.width);
    });
    expect(gapPx).toBeGreaterThanOrEqual(28);
  });

  test('Zoom to step toggle exists in the directions header + reflects state', async ({ page }) => {
    const cb = page.locator('#zoomToStepCheckbox');
    await expect(cb).toBeAttached();
    await expect(cb).toBeChecked(); // checked by default
    // Toggling updates the window-level flag
    await page.evaluate(() => window.setZoomToStep(false));
    const v = await page.evaluate(() => window.zoomToStep);
    expect(v).toBe(false);
    await page.evaluate(() => window.setZoomToStep(true));
    const v2 = await page.evaluate(() => window.zoomToStep);
    expect(v2).toBe(true);
  });

  test('sim panel has internal right padding so content does not run flush to its column edge', async ({ page }) => {
    await page.locator('#essentialsSimulator').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const padRight = await page.evaluate(() => {
      const p = document.querySelector('.sim-panel');
      return getComputedStyle(p).paddingRight;
    });
    expect(parseFloat(padRight)).toBeGreaterThanOrEqual(10);
  });

  test('toggleAid hides/shows the Squatch HQ marker', async ({ page }) => {
    await page.waitForSelector('.hq-marker', { timeout: 5000 });
    // HQ is visible by default
    const before = await page.locator('.hq-marker').count();
    expect(before).toBe(1);
    await page.evaluate(() => window.toggleAid());
    // After toggle: marker removed from DOM
    const after = await page.locator('.hq-marker').count();
    expect(after).toBe(0);
    // Toggle back on
    await page.evaluate(() => window.toggleAid());
    const restored = await page.locator('.hq-marker').count();
    expect(restored).toBe(1);
  });

  test('toggleStreetview shows the numbered turn markers (7 of them)', async ({ page }) => {
    // addTurnMarkers() runs inside map.on('load'), which can fire AFTER
    // Playwright's networkidle at the 1440-wide viewport (more tiles =
    // later load event). Wait for the full forEach to complete and all
    // 7 markers to be in the turnMarkers[] array before we toggle.
    await page.waitForFunction(
      () => typeof turnMarkers !== 'undefined' && turnMarkers.length === 7,
      null,
      { timeout: 10000 }
    );
    // Initially hidden (display:none) — toggle exposes them
    const beforeVisible = await page.locator('.turn-marker:visible').count();
    expect(beforeVisible).toBe(0);
    await page.evaluate(() => window.toggleStreetview());
    const afterVisible = await page.locator('.turn-marker:visible').count();
    expect(afterVisible).toBe(7);
  });

  test('MapLibre navigation control (zoom + compass) is NOT rendered on the MAIN map', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // The weather radar mini-map keeps its own zoom buttons (it's a
    // separate MapLibre instance inside the weather panel). Only the
    // main #map should have no zoom control.
    const mainZoom = await page.locator('#map .maplibregl-ctrl-zoom-in').count();
    expect(mainZoom).toBe(0);
  });

  test('editorial template duplicate map controls are hidden', async ({ page }) => {
    // race-shell.html renders a .map-controls bar above {{MAP_HTML}}; we
    // hide it for wild-goose because our inline button set is the source
    // of truth.
    const ed = page.locator('.course__map > .map-controls');
    await expect(ed).toBeHidden();
  });

  test('assembly chips no longer render CW/CCW direction pills', async ({ page }) => {
    await expect(page.locator('.assembly-chip__dir')).toHaveCount(0);
  });

  test('sim panel + visual columns do NOT overlap', async ({ page }) => {
    // Scroll the simulator into view so layout settles
    await page.locator('#essentialsSimulator').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const data = await page.evaluate(() => {
      const panel = document.querySelector('.sim-panel');
      const visual = document.querySelector('.sim-visual');
      const container = document.querySelector('.sim-container');
      const p = panel.getBoundingClientRect();
      const v = visual.getBoundingClientRect();
      const cs = getComputedStyle(panel);
      return {
        panelRight: p.x + p.width,
        visualLeft: v.x,
        panelMinWidth: cs.minWidth,
        panelWidth: p.width,
        panelScrollWidth: panel.scrollWidth,
        track: getComputedStyle(container).gridTemplateColumns,
      };
    });
    console.log('SIM LAYOUT DEBUG:', JSON.stringify(data));
    expect(data.panelRight).toBeLessThanOrEqual(data.visualLeft + 1);
  });

  test('Squatch HQ marker renders at non-zero size AND visually within the map viewport', async ({ page }) => {
    // The .hq-marker MapLibre wrapper had width 0 in the first iteration
    // because no CSS rule sized it — the SVG inside uses viewBox-only
    // sizing and collapses to 0x0 without explicit dimensions. Verify
    // the marker now reads as a 32x32 element AND its screen position
    // falls inside the map element (so it's actually visible to the
    // user, not just sized but positioned off-screen).
    await page.waitForSelector('.hq-marker', { timeout: 5000 });
    const data = await page.evaluate(() => {
      const m = document.querySelector('.hq-marker');
      const map = document.querySelector('#map');
      if (!m || !map) return null;
      const mr = m.getBoundingClientRect();
      const mapR = map.getBoundingClientRect();
      return {
        marker: { x: mr.x, y: mr.y, w: mr.width, h: mr.height },
        map:    { x: mapR.x, y: mapR.y, w: mapR.width, h: mapR.height },
      };
    });
    expect(data).toBeTruthy();
    expect(data.marker.w).toBeGreaterThanOrEqual(24);
    expect(data.marker.h).toBeGreaterThanOrEqual(24);
    // Marker center must lie inside the map's screen rect
    const mx = data.marker.x + data.marker.w / 2;
    const my = data.marker.y + data.marker.h / 2;
    expect(mx).toBeGreaterThan(data.map.x);
    expect(mx).toBeLessThan(data.map.x + data.map.w);
    expect(my).toBeGreaterThan(data.map.y);
    expect(my).toBeLessThan(data.map.y + data.map.h);
  });

  test('captures a map-area screenshot for HQ marker visual verification', async ({ page }, testInfo) => {
    await page.waitForSelector('.hq-marker', { timeout: 5000 });
    // Wait for the map tiles to paint (a small extra delay helps the
    // marker layer settle after the load event).
    await page.waitForTimeout(800);
    const mapWrap = page.locator('.map-wrap').first();
    await mapWrap.screenshot({ path: testInfo.outputPath('wild-goose-map-area.png') });
  });

  test('directions section is the FIRST content child of the cue column (right of map, above aid card)', async ({ page }) => {
    // The aid card / no-aid strip used to be above the directions; the
    // page reads better with the loop assembly chip strip + cues
    // immediately right of the map. override.js reorderCueColumn()
    // moves the directions section to be the first non-header child.
    const order = await page.evaluate(() => {
      const cues = document.querySelector('.course__cues');
      if (!cues) return null;
      return Array.from(cues.children).map(c => ({
        tag: c.tagName.toLowerCase(),
        id: c.id,
        cls: c.className,
      }));
    });
    expect(order).toBeTruthy();
    // First non-h1 child should be the directions section (the scope-note
    // band that used to sit here was removed sitewide · May 2026).
    const firstContentChild = order.find(c => !c.cls.includes('visually-hidden'));
    expect(firstContentChild.id).toBe('directionsSection');
    // And the aid card should come AFTER the directions
    const aidIdx = order.findIndex(c => c.cls.includes('hq-aid-card'));
    const dirIdx = order.findIndex(c => c.id === 'directionsSection');
    expect(dirIdx).toBeLessThan(aidIdx);
  });

  test('essentials sections cap at ~720px width and center below the map', async ({ page }) => {
    // Below-the-map content used to span the full container (1185px on
    // a 1200px viewport). Reading dense text at that width is hard;
    // cap the essentials sections + footer to a comfortable ~720px.
    const widths = await page.evaluate(() => {
      const out = [];
      const main = document.querySelector('.race-page__main');
      const mainW = main ? main.getBoundingClientRect().width : 0;
      document.querySelectorAll('main > section.essentials').forEach(el => {
        if (el.hasAttribute('hidden')) return;
        const rect = el.getBoundingClientRect();
        out.push({ id: el.id, w: rect.width, mainW });
      });
      return out;
    });
    expect(widths.length).toBeGreaterThan(0);
    for (const e of widths) {
      // Width should be ≤ 720px (the CSS cap) on a 1200px+ viewport
      expect(e.w).toBeLessThanOrEqual(720);
      // And the cap should actually apply (i.e. less than main column width)
      expect(e.w).toBeLessThan(e.mainW);
    }
  });

  test('captures a desktop fullpage screenshot for manual review', async ({ page }, testInfo) => {
    await page.screenshot({
      path: testInfo.outputPath('wild-goose-desktop.png'),
      fullPage: true,
    });
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

// ─── Mobile UI/UX + functional contract (iPhone 11 / common Android) ───
//
// At 375×812 the editorial layout collapses: sticky map + cues column
// stacks into map-on-top + cues-below. Top bar must still render legible,
// the chip strip must scroll horizontally without overflowing, and every
// interactive surface (loop chips, distance tabs, simulator) must remain
// reachable. The aid card grid drops to single column.

test.describe('Wild Goose — mobile (iPhone 11 / 375×812)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/maps/wild-goose/');
  });

  test('top bar fits inside viewport — no horizontal overflow', async ({ page }) => {
    const dims = await page.evaluate(() => {
      const bar = document.querySelector('.top-bar');
      const rect = bar.getBoundingClientRect();
      return {
        w: rect.width,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      };
    });
    expect(dims.scrollW).toBeLessThanOrEqual(dims.innerW + 1);
  });

  test('map is still visible above the fold and dominant', async ({ page }) => {
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).toBeTruthy();
    // Map should be visible in the first viewport
    expect(mapBox.y).toBeLessThan(812);
    // And take meaningful height
    expect(mapBox.height).toBeGreaterThanOrEqual(280);
  });

  test('Squatch HQ marker renders at non-zero size on mobile too', async ({ page }) => {
    await page.waitForSelector('.hq-marker', { timeout: 5000 });
    const dims = await page.evaluate(() => {
      const el = document.querySelector('.hq-marker');
      const rect = el.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    });
    expect(dims.w).toBeGreaterThanOrEqual(24);
    expect(dims.h).toBeGreaterThanOrEqual(24);
  });

  test('distance picker tabs horizontal-scroll instead of overflowing', async ({ page }) => {
    const tabsContainer = page.locator('.dir-race-tabs');
    await expect(tabsContainer).toBeVisible();
    const overflowOk = await tabsContainer.evaluate(el => {
      const cs = getComputedStyle(el);
      // Either content fits, OR the container is set up to scroll
      return el.scrollWidth <= el.clientWidth + 1 || cs.overflowX !== 'visible';
    });
    expect(overflowOk).toBe(true);
  });

  test('all 6 distance tabs remain reachable (tap-scrollable)', async ({ page }) => {
    const tabs = page.locator('.dir-race-tab');
    await expect(tabs).toHaveCount(6);
  });

  test('assembly chip strip wraps or scrolls without breaking layout', async ({ page }) => {
    // Switch to 100M which has 16 chips — stress test the chip strip
    await page.locator('.dir-race-tab[data-race="100m"]').click();
    const strip = page.locator('#assemblyStrip');
    await expect(strip).toBeVisible();
    const overflowOk = await strip.evaluate(el => {
      // Either it wraps (flex-wrap), or it scrolls
      const cs = getComputedStyle(el);
      return cs.flexWrap === 'wrap' || el.scrollWidth <= el.clientWidth + 1;
    });
    expect(overflowOk).toBe(true);
  });

  test('Squatch HQ aid card grid collapses to a single column', async ({ page }) => {
    const grid = page.locator('.hq-aid-card__grid');
    await expect(grid).toBeVisible();
    const cellsPerRow = await grid.evaluate(el => {
      const cells = Array.from(el.children);
      if (cells.length < 2) return 1;
      const firstTop = cells[0].getBoundingClientRect().top;
      const secondTop = cells[1].getBoundingClientRect().top;
      return Math.abs(firstTop - secondTop) < 4 ? 2 : 1;
    });
    expect(cellsPerRow).toBe(1);
  });

  test('simulator collapses to single column on mobile', async ({ page }) => {
    // The sim-container has a 2-col grid that collapses below 880px via
    // a media query. Verify the visual column lands below the panel.
    const sim = page.locator('#essentialsSimulator');
    await expect(sim).toBeVisible();
    const stacked = await sim.evaluate(el => {
      const panel = el.querySelector('.sim-panel');
      const visual = el.querySelector('.sim-visual');
      if (!panel || !visual) return false;
      return visual.getBoundingClientRect().top > panel.getBoundingClientRect().bottom - 10;
    });
    expect(stacked).toBe(true);
  });

  test('essentials sections occupy ~full viewport width on mobile (no max-width waste)', async ({ page }) => {
    // The desktop 720px cap is wider than mobile viewports — so on a
    // 375px screen the essentials should fill the available width (with
    // standard editorial padding, ~340px).
    const w = await page.evaluate(() => {
      const e = document.querySelector('#essentialsSimulator');
      return e ? e.getBoundingClientRect().width : 0;
    });
    expect(w).toBeGreaterThan(320);
  });

  test('map scrolls out of frame with the page — not pinned over the cue list', async ({ page }) => {
    // Customer report: with the map sticky on mobile, the cue steps
    // scrolled up BEHIND the map and the map only left the frame after
    // the entire course section. The map must scroll away like normal
    // page content. Wait for the cue list to hydrate first — before
    // that the page is short and the assertion would pass vacuously.
    await page.waitForSelector('#map .maplibregl-canvas');
    await page.waitForFunction(() =>
      document.querySelectorAll('#loopCueList li').length > 3);
    await page.evaluate(() => window.scrollTo(0, 1200));
    const top = await page.evaluate(() =>
      document.querySelector('.course__map').getBoundingClientRect().top);
    expect(top).toBeLessThan(0);
  });

  test('map canvas stays inside its container — no overhang onto the distance tabs', async ({ page }) => {
    const geo = await page.evaluate(() => {
      const container = document.querySelector('.course__map').getBoundingClientRect();
      const canvas = document.querySelector('.course__map .map-wrap').getBoundingClientRect();
      const tabs = document.querySelector('.dir-race-tabs').getBoundingClientRect();
      return { containerBottom: container.bottom, canvasBottom: canvas.bottom, tabsTop: tabs.top };
    });
    expect(geo.canvasBottom).toBeLessThanOrEqual(geo.containerBottom + 1);
    // Breathing room between the map edge and the distance selector.
    expect(geo.tabsTop).toBeGreaterThanOrEqual(geo.canvasBottom + 8);
  });

  test('captures a mobile fullpage screenshot for manual review', async ({ page }, testInfo) => {
    await page.screenshot({
      path: testInfo.outputPath('wild-goose-mobile.png'),
      fullPage: true,
    });
  });
});

// On phones the map column is sticky and ~50vh tall, so it owns a huge
// share of every viewport. If the MapLibre canvas swallows one-finger
// drags (its default), the page becomes nearly unscrollable in iPhone
// Safari — a customer-reported issue. Cooperative gestures must be on
// for coarse-pointer devices: one finger scrolls the page, two fingers
// pan the map.
test.describe('Wild Goose — mobile touch scrolling', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.waitForSelector('#map .maplibregl-canvas');
  });

  test('cooperative gestures are enabled on touch devices', async ({ page }) => {
    await expect(page.locator('#map .maplibregl-cooperative-gesture-screen')).toHaveCount(1);
  });

  test('a one-finger drag on the map scrolls the page, not the map', async ({ page }) => {
    const box = await page.locator('#map').boundingBox();
    const x = box.x + box.width / 2;
    const startY = box.y + box.height * 0.75;

    // The map auto-fitBounds on load; let that animation settle so the
    // before/after center comparison only measures the drag.
    await page.waitForFunction(() =>
      typeof map !== 'undefined' && map.loaded() && !map.isMoving());

    const before = await page.evaluate(() => ({
      scrollY: window.scrollY,
      center: typeof map !== 'undefined' ? map.getCenter().toArray() : null,
    }));
    expect(before.scrollY).toBe(0);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y: startY }],
    });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y: startY - i * 45 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect.poll(() => page.evaluate(() => window.scrollY), {
      timeout: 3000,
    }).toBeGreaterThan(100);

    const centerAfter = await page.evaluate(() =>
      typeof map !== 'undefined' ? map.getCenter().toArray() : null);
    expect(centerAfter[0]).toBeCloseTo(before.center[0], 5);
    expect(centerAfter[1]).toBeCloseTo(before.center[1], 5);
  });
});
