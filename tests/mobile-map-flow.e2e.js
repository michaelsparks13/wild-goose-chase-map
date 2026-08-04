// mobile-map-flow.e2e.js — every map, at phone width, must let the page
// scroll past the map (customer report, Aug 2026). Rendered-layout
// assertions complementing the build-level checks in
// mobile-scroll-guardrails.test.js:
//
//   1. The map container is not sticky/fixed — it scrolls out of frame
//      with the page instead of pinning over the cue list.
//   2. The MapLibre canvas stays inside its container — no overhang
//      painting over whatever sits below (distance tabs, stats, cues).
//   3. The same holds with `prefers-reduced-motion: reduce`. A rule in
//      that media query used to un-position the map column, which threw
//      the canvas to the document origin at viewport size and buried the
//      whole cue sheet under it. Nothing in the suite exercised the
//      preference, so it shipped for three months.
//   4. Landscape still shows some cue sheet — a flat 360px map floor is
//      92% of a phone's landscape viewport.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const mapsDir = path.resolve(__dirname, '../dist/maps');
const slugs = fs.existsSync(mapsDir)
  ? fs.readdirSync(mapsDir).filter((s) =>
      fs.existsSync(path.join(mapsDir, s, 'index.html')))
  : [];

// Geometry of the map column, the real <canvas> (not the #map container,
// which is pinned to the column by construction and so cannot report an
// overhang), and the first thing rendered below the map.
async function readLayout(page) {
  return page.evaluate(() => {
    const container =
      document.querySelector('.course__map') ||
      document.querySelector('.map-wrap');
    const canvas = document.querySelector('.maplibregl-canvas');
    const box = container.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const tabs = document.querySelector('.dir-race-tabs');
    const cues = document.querySelector('.course__cues');

    // Cue text the canvas is painting over, via hit testing. This is the
    // symptom a runner actually reports, independent of the mechanism.
    let covered = 0;
    let sampled = 0;
    if (cues) {
      const walker = document.createTreeWalker(cues, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const el = node.parentElement;
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const x = r.left + Math.min(r.width / 2, 40);
        const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        sampled++;
        const hit = document.elementFromPoint(x, y);
        if (hit && !cues.contains(hit)) covered++;
      }
    }

    return {
      position: getComputedStyle(container).position,
      containerTop: box.top,
      containerBottom: box.bottom,
      canvasBottom: canvasBox.bottom,
      canvasHeight: canvasBox.height,
      containerHeight: box.height,
      tabsTop: tabs ? tabs.getBoundingClientRect().top : null,
      hasCues: !!cues,
      covered,
      sampled,
    };
  });
}

function assertMapContained(layout) {
  // Never sticky/fixed on mobile, and never static — static removes the
  // column as the containing block for its absolutely positioned canvas.
  expect(layout.position).toBe('relative');
  expect(layout.canvasBottom).toBeLessThanOrEqual(layout.containerBottom + 1);
  expect(layout.canvasHeight).toBeLessThanOrEqual(layout.containerHeight + 1);
  if (layout.tabsTop !== null) {
    expect(layout.tabsTop).toBeGreaterThanOrEqual(layout.containerBottom - 1);
  }
  if (layout.hasCues) {
    expect(layout.sampled).toBeGreaterThan(0);
    expect(layout.covered).toBe(0);
  }
}

test.describe('mobile map flow — all maps (375×812)', () => {
  test('build output contains map pages', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    test(`${slug}: map container scrolls with the page and canvas does not overhang`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/maps/${slug}/`);
      await page.waitForSelector('.maplibregl-canvas');
      assertMapContained(await readLayout(page));
    });
  }
});

// The client-reported defect. iOS Settings → Accessibility → Motion →
// Reduce Motion made the map canvas detach from its column and cover the
// cue sheet on every editorial race, at every width.
test.describe('reduced motion keeps the map inside its column', () => {
  // `page.emulateMedia`, not `test.use({ reducedMotion })` — the fixture
  // form is silently ignored under this config (verified: matchMedia stays
  // false), which would make every test below pass without ever exercising
  // the preference. Each test re-asserts that the query really matches so
  // the suite can never go vacuously green again.
  async function gotoReduced(page, slug, width, height) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await page.goto(`/maps/${slug}/`);
    await page.waitForSelector('.maplibregl-canvas');
    const active = await page.evaluate(() =>
      matchMedia('(prefers-reduced-motion: reduce)').matches);
    expect(active, 'reduced-motion emulation did not take effect').toBe(true);
  }

  for (const slug of slugs) {
    test(`${slug}: canvas stays in the map column with Reduce Motion on`, async ({ page }) => {
      await gotoReduced(page, slug, 390, 844);
      assertMapContained(await readLayout(page));
    });
  }

  test('desktop: reduced motion does not collapse the sticky map column', async ({ page }) => {
    await gotoReduced(page, 'wild-goose-ringwood', 1440, 900);

    const layout = await readLayout(page);
    expect(layout.position).toBe('sticky');
    // `height: auto` used to stretch this to an empty full-row grid item.
    expect(layout.containerHeight).toBeLessThanOrEqual(900);
    expect(layout.covered).toBe(0);

    // The first cue step must remain clickable, not buried under a canvas.
    const reachable = await page.evaluate(() => {
      const step = document.querySelector('.course__cues .dir-step, .course__cues .loop-cue');
      if (!step) return true;
      step.scrollIntoView({ block: 'center' });
      const r = step.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
      return !!(hit && step.contains(hit));
    });
    expect(reachable).toBe(true);
  });

  test('the page-load reveal is actually suppressed', async ({ page }) => {
    await gotoReduced(page, 'wild-goose-ringwood', 390, 844);
    // The cancel rule used to be a `.race-page > *` catch-all, which lost
    // on specificity to the rule that applies the reveal.
    const animation = await page.evaluate(() =>
      getComputedStyle(document.querySelector('main.race-page__main')).animationName);
    expect(animation).toBe('none');
  });
});

// A flat 360px map floor left literally zero pixels of cue sheet on a
// phone in landscape, and cut off the bottom of the map as well.
test.describe('landscape keeps cue content on screen', () => {
  for (const [width, height] of [[844, 390], [932, 430], [812, 375]]) {
    test(`${width}×${height}: cue sheet is co-visible with the map`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/maps/wild-goose-ringwood/');
      await page.waitForSelector('.maplibregl-canvas');

      const view = await page.evaluate(() => {
        const map = document.querySelector('.course__map').getBoundingClientRect();
        const cues = document.querySelector('.course__cues').getBoundingClientRect();
        return {
          mapBottom: map.bottom,
          cueVisible: Math.max(0, Math.min(cues.bottom, innerHeight) - Math.max(cues.top, 0)),
        };
      });

      // The map itself must fit above the fold...
      expect(view.mapBottom).toBeLessThanOrEqual(height);
      // ...and leave a usable slice of the cue column visible under it.
      expect(view.cueVisible).toBeGreaterThan(40);
    });
  }
});
