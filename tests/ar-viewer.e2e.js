import { test, expect } from '@playwright/test';

// The AR preview page is WebGL-heavy; wait for model-viewer to finish
// loading the GLB before asserting anything visual.
async function waitForModel(page) {
  await page.waitForFunction(
    () => document.getElementById('courseModel')?.loaded,
    { timeout: 30000 }
  );
}

test.describe('AR course preview — escarpment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ar/escarpment/');
    await waitForModel(page);
  });

  test('page loads the model without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await expect(page).toHaveTitle(/Escarpment Trail Run 30K — AR Course Preview/);
    await expect(page.locator('.masthead-name')).toHaveText('Escarpment Trail Run 30K');
    await expect(page.locator('.masthead-scale')).toContainText('1:40,944');
    expect(errors).toEqual([]);
  });

  test('lead-pack animation is present and plays by default', async ({ page }) => {
    const state = await page.evaluate(() => {
      const mv = document.getElementById('courseModel');
      return { animations: mv.availableAnimations, duration: mv.duration };
    });
    expect(state.animations).toContain('lead-pack-run');
    expect(state.duration).toBe(45);
    await expect(page.locator('#playBtn')).toHaveAttribute('data-state', 'playing');
  });

  test('scrubbing pauses playback and updates the mile readout', async ({ page }) => {
    await page.evaluate(() => {
      const s = document.getElementById('scrubber');
      s.value = '500';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#mileNow')).toHaveText('9.3');
    await expect(page.locator('#playBtn')).toHaveAttribute('data-state', 'paused');
    const time = await page.evaluate(
      () => document.getElementById('courseModel').currentTime
    );
    expect(time).toBeCloseTo(22.5, 1);
    await expect(page.locator('#trackFill')).toHaveCSS('width', /^\d/);
  });

  test('play button toggles the animation', async ({ page }) => {
    await page.locator('#playBtn').click();
    await expect(page.locator('#playBtn')).toHaveAttribute('data-state', 'paused');
    const paused = await page.evaluate(() => document.getElementById('courseModel').paused);
    expect(paused).toBe(true);
    await page.locator('#playBtn').click();
    await expect(page.locator('#playBtn')).toHaveAttribute('data-state', 'playing');
  });

  test('tapping an aid hotspot opens its card; close dismisses it', async ({ page }) => {
    await page.evaluate(() => document.querySelector('[data-aid="0"]').click());
    const card = page.locator('#aidCard');
    await expect(card).toBeVisible();
    await expect(page.locator('#aidCardName')).toHaveText('Windham Peak');
    await expect(page.locator('#aidCardMile')).toHaveText('3.5');
    await expect(page.locator('#aidCardServices')).toContainText('Water');
    await page.locator('#aidCardClose').click();
    await expect(card).toBeHidden();
  });

  test('hotspot count matches the aid stations in AR_META', async ({ page }) => {
    const counts = await page.evaluate(() => ({
      hotspots: document.querySelectorAll('.hotspot').length,
      ticks: document.querySelectorAll('.tick').length,
    }));
    expect(counts.hotspots).toBe(7);
    expect(counts.ticks).toBe(7);
  });

  test('without WebXR, no AR entry is offered on desktop', async ({ page }) => {
    await expect(page.locator('body')).toHaveAttribute('data-ar-mode', 'none');
    await expect(page.locator('#xrArBtn')).toBeHidden();
    await expect(page.locator('#nativeArBtn')).toBeHidden();
  });
});

test.describe('AR course preview — capability gating', () => {
  test('WebXR-capable devices get the custom AR entry', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'xr', {
        value: { isSessionSupported: async (mode) => mode === 'immersive-ar' },
        configurable: true,
      });
    });
    await page.goto('/ar/escarpment/');
    await waitForModel(page);
    await expect(page.locator('body')).toHaveAttribute('data-ar-mode', 'webxr');
    await expect(page.locator('#xrArBtn')).toBeVisible();
    await expect(page.locator('#nativeArBtn')).toBeHidden();
  });

  test('a failing XR probe degrades to plain 3D, not a broken page', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'xr', {
        value: { isSessionSupported: async () => { throw new Error('nope'); } },
        configurable: true,
      });
    });
    await page.goto('/ar/escarpment/');
    await waitForModel(page);
    await expect(page.locator('body')).toHaveAttribute('data-ar-mode', 'none');
    await expect(page.locator('#xrArBtn')).toBeHidden();
    // Core experience still works.
    await page.evaluate(() => document.querySelector('[data-aid="1"]').click());
    await expect(page.locator('#aidCard')).toBeVisible();
  });
});

test.describe('AR course preview — mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/ar/escarpment/');
    await waitForModel(page);
  });

  test('no horizontal overflow', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('console and masthead fit the viewport', async ({ page }) => {
    const consoleBox = await page.locator('.console').boundingBox();
    expect(consoleBox.y + consoleBox.height).toBeLessThanOrEqual(812);
    await expect(page.locator('.masthead-name')).toBeVisible();
    await expect(page.locator('#scrubber')).toBeVisible();
  });

  test('aid card fits above the console', async ({ page }) => {
    await page.evaluate(() => document.querySelector('[data-aid="2"]').click());
    await expect(page.locator('#aidCard')).toBeVisible();
    const card = await page.locator('#aidCard').boundingBox();
    const consoleBox = await page.locator('.console').boundingBox();
    expect(card.y + card.height).toBeLessThanOrEqual(consoleBox.y + 1);
    await page.screenshot({ path: 'test-results/ar-mobile-card.png' });
  });
});
