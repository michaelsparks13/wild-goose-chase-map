import { test, expect } from '@playwright/test';

// E2E coverage for the interactive turn-by-turn feature.
//
// We intentionally exercise the *structural* + *state* outcomes of each user
// gesture (active class on the chosen step, list scroll behavior, mode toggle
// switching), rather than asserting visual attributes of the MapLibre highlight
// layer. The map is a WebGL surface; verifying paint properties via JS is
// brittle and slow. We do verify the source data (which is the load-bearing
// invariant for the highlight) by reaching into the map JS API.

test.describe('Tinman interactive directions', () => {
  // Each test gets a fresh BrowserContext from Playwright by default, so
  // localStorage starts empty automatically. We deliberately avoid
  // addInitScript here because it re-runs on `page.reload()` and would wipe
  // the saved mode mid-test, breaking the persistence assertion.
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/tinman/');
    await page.waitForSelector('#map');
    await page.waitForFunction(() =>
      document.querySelectorAll('#directionsList .dir-step').length > 0
    );
  });

  test('mode toggle is present with Click selected by default', async ({ page }) => {
    const clickBtn = page.locator('.dir-mode-btn[data-mode="click"]');
    const scrubBtn = page.locator('.dir-mode-btn[data-mode="scrub"]');
    await expect(clickBtn).toBeVisible();
    await expect(scrubBtn).toBeVisible();
    await expect(clickBtn).toHaveClass(/active/);
    await expect(scrubBtn).not.toHaveClass(/active/);
  });

  test('first step is active on initial render', async ({ page }) => {
    const first = page.locator('#directionsList .dir-step').first();
    await expect(first).toHaveClass(/active/);
  });

  test('clicking a step activates it and removes active from prior step', async ({ page }) => {
    const steps = page.locator('#directionsList .dir-step');
    const count = await steps.count();
    expect(count).toBeGreaterThan(3);

    // Expand the directions section so the steps are interactive.
    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }

    await steps.nth(2).click();
    await expect(steps.nth(2)).toHaveClass(/active/);
    await expect(steps.nth(0)).not.toHaveClass(/active/);
    await expect(steps.nth(1)).not.toHaveClass(/active/);
  });

  test('clicking a step updates the dir-active-pin map source', async ({ page }) => {
    // Wait for the map to finish loading and register the highlight sources.
    await page.waitForFunction(() =>
      window.map && window.map.loaded && window.map.loaded() &&
      window.map.getSource('dir-active-pin')
    );

    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }
    await page.locator('#directionsList .dir-step').nth(3).click();

    // Read the source data via the public style accessor. MapLibre's
    // GeoJSONSource keeps the assigned data in style.sources[id].data once
    // setData has been called.
    const pinFeatureCount = await page.evaluate(() => {
      const data = window.map.getStyle().sources['dir-active-pin'].data;
      return data && data.features ? data.features.length : 0;
    });
    expect(pinFeatureCount).toBe(1);

    const segCoordCount = await page.evaluate(() => {
      const data = window.map.getStyle().sources['dir-active-segment'].data;
      return data && data.geometry ? data.geometry.coordinates.length : 0;
    });
    expect(segCoordCount).toBeGreaterThan(1);
  });

  test('mode toggle switches between Click and Scrub', async ({ page }) => {
    const scrubBtn = page.locator('.dir-mode-btn[data-mode="scrub"]');
    const clickBtn = page.locator('.dir-mode-btn[data-mode="click"]');
    await scrubBtn.click();
    await expect(scrubBtn).toHaveClass(/active/);
    await expect(clickBtn).not.toHaveClass(/active/);

    // Section auto-expands when entering Scrub (the list is the camera in scrub mode).
    await expect(page.locator('#directionsSection')).toHaveClass(/mode-scrub/);
    await expect(page.locator('#directionsSection')).toHaveClass(/expanded/);

    await clickBtn.click();
    await expect(clickBtn).toHaveClass(/active/);
    await expect(scrubBtn).not.toHaveClass(/active/);
    await expect(page.locator('#directionsSection')).not.toHaveClass(/mode-scrub/);
  });

  test('mode preference persists across page reloads via localStorage', async ({ page }) => {
    await page.locator('.dir-mode-btn[data-mode="scrub"]').click();
    await expect(page.locator('.dir-mode-btn[data-mode="scrub"]')).toHaveClass(/active/);

    await page.reload();
    await page.waitForSelector('#map');
    await page.waitForFunction(() =>
      document.querySelectorAll('#directionsList .dir-step').length > 0
    );
    await expect(page.locator('.dir-mode-btn[data-mode="scrub"]')).toHaveClass(/active/);
    await expect(page.locator('#directionsSection')).toHaveClass(/mode-scrub/);
  });

  test('switching races resets active step to step 1 of the new race', async ({ page }) => {
    // Expand directions and pick step 4 of Tinman.
    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }
    await page.locator('#directionsList .dir-step').nth(4).click();
    await expect(page.locator('#directionsList .dir-step').nth(4)).toHaveClass(/active/);

    // Switch to Sprint via the race card.
    await page.locator('.race-card[data-race="sprint"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#directionsRaceLabel').textContent.includes('Sprint')
    );

    // First step of Sprint should be active; no other step active.
    const first = page.locator('#directionsList .dir-step').first();
    await expect(first).toHaveClass(/active/);
    const activeCount = await page.locator('#directionsList .dir-step.active').count();
    expect(activeCount).toBe(1);
  });

  test('Arrow keys navigate between steps in click mode', async ({ page }) => {
    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }
    const first = page.locator('#directionsList .dir-step').first();
    await first.focus();
    await page.keyboard.press('ArrowDown');

    await expect(page.locator('#directionsList .dir-step').nth(1)).toHaveClass(/active/);
    await expect(first).not.toHaveClass(/active/);

    await page.keyboard.press('ArrowUp');
    await expect(first).toHaveClass(/active/);
  });

  test('clicking a step does not collapse the directions section', async ({ page }) => {
    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }
    await expect(section).toHaveClass(/expanded/);
    await page.locator('#directionsList .dir-step').nth(2).click();
    await expect(section).toHaveClass(/expanded/);
  });

  test('clicking the mode toggle does not collapse the section', async ({ page }) => {
    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }
    await expect(section).toHaveClass(/expanded/);
    await page.locator('.dir-mode-btn[data-mode="scrub"]').click();
    await expect(section).toHaveClass(/expanded/);
    await page.locator('.dir-mode-btn[data-mode="click"]').click();
    await expect(section).toHaveClass(/expanded/);
  });
});
