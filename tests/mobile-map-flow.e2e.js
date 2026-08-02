// mobile-map-flow.e2e.js — every map, at phone width, must let the page
// scroll past the map (customer report, Aug 2026). Two rendered-layout
// assertions per map, complementing the build-level checks in
// mobile-scroll-guardrails.test.js:
//
//   1. The map container is not sticky/fixed — it scrolls out of frame
//      with the page instead of pinning over the cue list.
//   2. The map canvas stays inside its container — no overhang painting
//      over whatever sits below (distance tabs, stats, cues).

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const mapsDir = path.resolve(__dirname, '../dist/maps');
const slugs = fs.existsSync(mapsDir)
  ? fs.readdirSync(mapsDir).filter((s) =>
      fs.existsSync(path.join(mapsDir, s, 'index.html')))
  : [];

test.describe('mobile map flow — all maps (375×812)', () => {
  test('build output contains map pages', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    test(`${slug}: map container scrolls with the page and canvas does not overhang`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/maps/${slug}/`);
      await page.waitForSelector('#map');

      const layout = await page.evaluate(() => {
        const container =
          document.querySelector('.course__map') ||
          document.querySelector('.map-wrap');
        const style = getComputedStyle(container);
        const containerBox = container.getBoundingClientRect();
        const mapBox = document.querySelector('#map').getBoundingClientRect();
        return {
          position: style.position,
          containerBottom: containerBox.bottom,
          canvasBottom: mapBox.bottom,
        };
      });

      expect(['static', 'relative']).toContain(layout.position);
      expect(layout.canvasBottom).toBeLessThanOrEqual(layout.containerBottom + 1);
    });
  }
});
