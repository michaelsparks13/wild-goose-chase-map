// wild-goose-tbt.e2e.js — browser-level contract for the within-loop
// turn-by-turn list. Verifies:
//
//   • Each assembly chip swaps the within-loop list to that loop's
//     interleaved TBT + hazard cues (sorted by mile).
//   • Clicking a turn row sets `.active`, populates the
//     dir-active-segment source, and dims the non-focused loops.
//   • The Zoom-to-step toggle is persisted across reloads via
//     localStorage and gates fitBounds without dropping highlight.
//   • Mobile (375×812) renders the list without horizontal overflow
//     and items are tappable (≥ 44px tall).

import { test, expect } from '@playwright/test';

async function waitForLoopList(page) {
  // The list populates after the map load handler runs selectRace →
  // renderInterleavedList. On a cold cache + small mobile viewport the
  // map style + tile fetch can take well past 8s, so give it room.
  await page.waitForSelector('#loopCueList .loop-cue', { timeout: 20000, state: 'attached' });
}

test.describe('Wild Goose — turn-by-turn list (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/wild-goose/');
    await waitForLoopList(page);
  });

  test('interleaved list has both turn rows and hazard cue rows', async ({ page }) => {
    const counts = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#loopCueList .loop-cue'));
      return {
        total: items.length,
        turns: items.filter(li => li.dataset.kind === 'turn').length,
        cues:  items.filter(li => li.dataset.kind && li.dataset.kind !== 'turn').length,
      };
    });
    expect(counts.total).toBeGreaterThan(10);
    expect(counts.turns).toBeGreaterThan(5);
    // Pink loop has landmark + hazard cues authored in the theme.
    expect(counts.cues).toBeGreaterThanOrEqual(1);
  });

  test('list rows are sorted by mile ascending', async ({ page }) => {
    const miles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#loopCueList .loop-cue__mile'))
        .map(el => parseFloat(el.textContent));
    });
    for (let i = 1; i < miles.length; i++) {
      expect(miles[i]).toBeGreaterThanOrEqual(miles[i - 1] - 0.01);
    }
  });

  test('clicking an assembly chip swaps the list', async ({ page }) => {
    // Capture pink list first
    const pinkFirstRow = await page.locator('#loopCueList .loop-cue').first().textContent();
    // Click the Blue chip (3rd in 50K assembly: pink, checkered, blue, …)
    await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('.assembly-chip'));
      const blueIdx = chips.findIndex(c => c.textContent.trim() === 'Blue');
      window.selectAssemblyStep(blueIdx);
    });
    await page.waitForFunction(() => document.querySelector('.assembly-chip.active')?.textContent.trim() === 'Blue');
    const blueFirstRow = await page.locator('#loopCueList .loop-cue').first().textContent();
    expect(blueFirstRow).not.toBe(pinkFirstRow);
  });

  test('clicking a turn row sets active class + updates segment source + dims others', async ({ page }) => {
    // Find the first turn row (skip any leading cue rows)
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#loopCueList .loop-cue'));
      const turnIdx = rows.findIndex(r => r.dataset.kind === 'turn');
      window.setActiveTurnByRow(turnIdx);
    });
    await page.waitForSelector('#loopCueList .loop-cue.active');
    const result = await page.evaluate(() => {
      const src = window.map.getSource('dir-active-segment');
      const ser = src.serialize();
      const segCoords = ser.data.geometry.coordinates;
      return {
        segLen: segCoords.length,
        // Pink (focus) stays at 1; Blue + Checkered dim to 0.18.
        pinkOpacity: window.map.getPaintProperty('pink', 'line-opacity'),
        blueOpacity: window.map.getPaintProperty('blue', 'line-opacity'),
        checkeredOpacity: window.map.getPaintProperty('checkered', 'line-opacity'),
      };
    });
    expect(result.segLen).toBeGreaterThanOrEqual(2);
    expect(result.pinkOpacity).toBe(1);
    expect(result.blueOpacity).toBeLessThan(0.5);
    expect(result.checkeredOpacity).toBeLessThan(0.5);
  });

  test('switching loops clears the active highlight', async ({ page }) => {
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#loopCueList .loop-cue'));
      const turnIdx = rows.findIndex(r => r.dataset.kind === 'turn');
      window.setActiveTurnByRow(turnIdx);
    });
    await page.waitForSelector('#loopCueList .loop-cue.active');
    await page.evaluate(() => window.selectAssemblyStep(1)); // switch to next loop in assembly
    const afterSwitch = await page.evaluate(() => {
      const ser = window.map.getSource('dir-active-segment').serialize();
      return {
        activeCount: document.querySelectorAll('#loopCueList .loop-cue.active').length,
        segLen: ser.data.geometry.coordinates.length,
        pinkOpacity: window.map.getPaintProperty('pink', 'line-opacity'),
      };
    });
    expect(afterSwitch.activeCount).toBe(0);
    expect(afterSwitch.segLen).toBe(0);
    expect(afterSwitch.pinkOpacity).toBe(1);
  });

  test('zoom-to-step checkbox persists in localStorage', async ({ page }) => {
    // Toggle off, reload, expect off
    await page.locator('#zoomToStepCheckbox').uncheck();
    await page.reload();
    await waitForLoopList(page);
    const checked = await page.locator('#zoomToStepCheckbox').isChecked();
    expect(checked).toBe(false);
    // Toggle back on for cleanup
    await page.locator('#zoomToStepCheckbox').check();
  });

  test('with zoom-to-step OFF, clicking a turn does NOT change camera but still highlights', async ({ page }) => {
    await page.locator('#zoomToStepCheckbox').uncheck();
    const before = await page.evaluate(() => ({
      zoom: window.map.getZoom(),
      center: window.map.getCenter(),
    }));
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#loopCueList .loop-cue'));
      const turnIdx = rows.findIndex(r => r.dataset.kind === 'turn');
      window.setActiveTurnByRow(turnIdx);
    });
    await page.waitForSelector('#loopCueList .loop-cue.active');
    await page.waitForTimeout(900);   // flyTo would finish in 600ms — wait past that
    const after = await page.evaluate(() => ({
      zoom: window.map.getZoom(),
      center: window.map.getCenter(),
    }));
    expect(Math.abs(after.zoom - before.zoom)).toBeLessThan(0.05);
    expect(Math.abs(after.center.lng - before.center.lng)).toBeLessThan(0.001);
    // Highlight should still be applied
    expect(await page.locator('#loopCueList .loop-cue.active').count()).toBe(1);
  });

  test('turn rows carry direction-aware classes (left vs right vs sharp)', async ({ page }) => {
    const classes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#loopCueList .loop-cue--turn'))
        .map(li => li.className);
    });
    expect(classes.some(c => c.includes('loop-cue--turn-left'))).toBe(true);
    expect(classes.some(c => c.includes('loop-cue--turn-right'))).toBe(true);
    // Pink loop's TBT includes at least one SHARP LEFT (mi 1.44).
    expect(classes.some(c => c.includes('loop-cue--turn-sharp'))).toBe(true);
  });
});

test.describe('Wild Goose — turn-by-turn list (mobile 375×812)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/maps/wild-goose/');
    await waitForLoopList(page);
  });

  test('list renders without horizontal page overflow', async ({ page }) => {
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('turn rows are tappable (≥ 44px tall) per iOS guidelines', async ({ page }) => {
    const sizes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#loopCueList .loop-cue--turn'))
        .slice(0, 5)
        .map(li => li.getBoundingClientRect().height);
    });
    expect(sizes.length).toBeGreaterThan(0);
    for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);
  });

  test('zoom-to-step checkbox is reachable inside the directions header', async ({ page }) => {
    await expect(page.locator('#zoomToStepCheckbox')).toBeVisible();
  });

  test('"Zoom to step" label stays visible on mobile (regression for hidden span)', async ({ page }) => {
    // The earlier @media (max-width: 480px) rule hid this span, leaving
    // a bare checkbox with no semantic affordance. Keep the label.
    const labelInfo = await page.evaluate(() => {
      const span = document.querySelector('.dir-zoom-toggle span');
      const rect = span?.getBoundingClientRect();
      return {
        text: span?.textContent,
        width: rect?.width,
        display: span ? getComputedStyle(span).display : null,
      };
    });
    expect(labelInfo.text).toBe('Zoom to step');
    expect(labelInfo.display).not.toBe('none');
    expect(labelInfo.width).toBeGreaterThan(40);
  });

  test('Layers trigger does NOT overlap the Squatch HQ badge (regression)', async ({ page }) => {
    // Previously the right-anchored 4-button row crept left into HQ on
    // narrow viewports. The single Layers trigger is ~130px wide, so it
    // sits comfortably top-right with HQ untouched at top-left.
    const layout = await page.evaluate(() => {
      const hq = document.querySelector('.hq-badge').getBoundingClientRect();
      const trig = document.getElementById('mapLayersBtn').getBoundingClientRect();
      return { overlap: trig.left < hq.right && trig.top < hq.bottom };
    });
    expect(layout.overlap).toBe(false);
  });
});
