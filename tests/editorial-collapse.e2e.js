// editorial-collapse.e2e.js — covers the shared mobile collapse pattern:
//
//   (a) The top bar shrinks to a single row on mobile (race name +
//       countdown + chevron) and expands on tap; preference persists
//       via localStorage and applies across every race page.
//   (b) The Layers popover (wild-goose) replaces the permanent 4-button
//       overlay with a compact trigger; checkboxes mirror state with
//       the existing toggle functions.

import { test, expect } from '@playwright/test';

test.describe('Top bar collapse — mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('Wild Goose: top bar collapses by default (≤ 60px tall)', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fss.topBarExpanded'));
    await page.goto('/maps/wild-goose/');
    const info = await page.evaluate(() => {
      const bar = document.querySelector('.top-bar');
      return {
        h: bar.getBoundingClientRect().height,
        expanded: bar.getAttribute('data-expanded'),
        chevronVisible: getComputedStyle(document.getElementById('topBarExpand')).display !== 'none',
      };
    });
    expect(info.expanded).toBe('false');
    expect(info.chevronVisible).toBe(true);
    expect(info.h).toBeLessThan(60);
  });

  test('Tinman: same collapse pattern (cross-race chrome change)', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fss.topBarExpanded'));
    await page.goto('/maps/tupper-lake-tinman/');
    const h = await page.evaluate(() => document.querySelector('.top-bar').getBoundingClientRect().height);
    expect(h).toBeLessThan(80);
  });

  test('detail elements are hidden when collapsed, visible when expanded', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('fss.topBarExpanded'));
    await page.goto('/maps/wild-goose/');

    const collapsed = await page.evaluate(() => {
      const edition = document.querySelector('.race-mark__edition');
      const gun = document.querySelector('.rds-start');
      const utility = document.querySelector('.top-bar__utility');
      return {
        editionHidden: edition ? getComputedStyle(edition).display === 'none' : true,
        gunHidden: gun ? getComputedStyle(gun).display === 'none' : true,
        utilityHidden: utility ? getComputedStyle(utility).display === 'none' : true,
      };
    });
    expect(collapsed.editionHidden).toBe(true);
    expect(collapsed.gunHidden).toBe(true);
    expect(collapsed.utilityHidden).toBe(true);

    await page.locator('#topBarExpand').click();

    const expanded = await page.evaluate(() => {
      const edition = document.querySelector('.race-mark__edition');
      const utility = document.querySelector('.top-bar__utility');
      return {
        editionVisible: edition && getComputedStyle(edition).display !== 'none',
        utilityVisible: utility && getComputedStyle(utility).display !== 'none',
        expanded: document.querySelector('.top-bar').getAttribute('data-expanded'),
      };
    });
    expect(expanded.editionVisible).toBe(true);
    expect(expanded.utilityVisible).toBe(true);
    expect(expanded.expanded).toBe('true');
  });

  test('expanded preference persists via localStorage', async ({ page }) => {
    await page.goto('/maps/wild-goose/');
    await page.evaluate(() => localStorage.removeItem('fss.topBarExpanded'));
    await page.locator('#topBarExpand').click();
    // Wait for the toggle handler to write the new value before reload.
    await page.waitForFunction(() => localStorage.getItem('fss.topBarExpanded') === 'true');
    await page.reload();
    const after = await page.evaluate(() =>
      document.querySelector('.top-bar').getAttribute('data-expanded')
    );
    expect(after).toBe('true');
    // Clean up so other tests aren't tainted.
    await page.evaluate(() => localStorage.removeItem('fss.topBarExpanded'));
  });

  test('the chevron is hidden on desktop ≥ 1024px (no-op)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/wild-goose/');
    const display = await page.evaluate(() =>
      getComputedStyle(document.getElementById('topBarExpand')).display
    );
    expect(display).toBe('none');
  });
});

test.describe('Layers popover — wild-goose', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/maps/wild-goose/');
    // Wait for the map load handler to fire — that's when the inline
    // buttons sync runs, which seeds the active-count badge.
    await page.waitForFunction(() => {
      const btn = document.getElementById('mapLayersBtn');
      return btn && btn.getAttribute('data-active-count') != null;
    }, { timeout: 20000 });
  });

  test('legacy .map-btns row is hidden — Layers popover is the primary UI', async ({ page }) => {
    const hidden = await page.evaluate(() => {
      const row = document.querySelector('.course__map .map-btns');
      return row && (row.hasAttribute('hidden') || getComputedStyle(row).display === 'none');
    });
    expect(hidden).toBe(true);
  });

  test('Layers trigger shows the active count badge (Aid Stations on by default → 1)', async ({ page }) => {
    const count = await page.locator('#mapLayersBtn').getAttribute('data-active-count');
    expect(count).toBe('1');
  });

  test('clicking trigger opens the panel; clicking outside closes it', async ({ page }) => {
    await page.locator('#mapLayersBtn').click();
    let state = await page.locator('.map-layers').getAttribute('data-state');
    expect(state).toBe('open');
    // Click outside (on the map element itself, far from the popover).
    await page.locator('#map').click({ position: { x: 50, y: 300 } });
    state = await page.locator('.map-layers').getAttribute('data-state');
    expect(state).toBe('closed');
  });

  test('toggling a checkbox updates count and fires the underlying handler', async ({ page }) => {
    await page.locator('#mapLayersBtn').click();
    // Turn ON Park Trails (was off).
    await page.locator('#layerTrails').check();
    const count = await page.locator('#mapLayersBtn').getAttribute('data-active-count');
    expect(count).toBe('2');
    // The inline (legacy) button's state must mirror — confirms the
    // sync stayed bidirectional after the markup swap.
    const inlineActive = await page.evaluate(() =>
      document.getElementById('trailBtnInline')?.classList.contains('active')
    );
    expect(inlineActive).toBe(true);
  });

  test('Escape key closes an open popover', async ({ page }) => {
    await page.locator('#mapLayersBtn').click();
    await page.keyboard.press('Escape');
    const state = await page.locator('.map-layers').getAttribute('data-state');
    expect(state).toBe('closed');
  });

  test('Layers trigger no longer overlaps the Squatch HQ badge', async ({ page }) => {
    const layout = await page.evaluate(() => {
      const hq = document.querySelector('.hq-badge').getBoundingClientRect();
      const trig = document.getElementById('mapLayersBtn').getBoundingClientRect();
      return { overlap: trig.left < hq.right && trig.top < hq.bottom };
    });
    expect(layout.overlap).toBe(false);
  });
});
