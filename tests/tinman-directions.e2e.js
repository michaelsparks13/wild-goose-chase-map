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
    await page.goto('/maps/tupper-lake-tinman/');
    await page.waitForSelector('#map');
    await page.waitForFunction(() =>
      document.querySelectorAll('#directionsList .dir-step').length > 0
    );
  });

  test('zoom-to-step checkbox is present and checked by default', async ({ page }) => {
    const cb = page.locator('#zoomToStepCheckbox');
    await expect(cb).toBeVisible();
    await expect(cb).toBeChecked();
    await expect(page.locator('label.dir-zoom-toggle')).toContainText('Zoom to step');
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

  test('clicking a step updates the dir-active-segment map source', async ({ page }) => {
    // Wait for the map to finish loading and register the highlight source.
    // (The dir-active-pin source was removed in feature_tinman_polish — the
    // segment alone communicates the active step now.)
    await page.waitForFunction(() =>
      window.map && window.map.loaded && window.map.loaded() &&
      window.map.getSource('dir-active-segment')
    );

    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }
    await page.locator('#directionsList .dir-step').nth(3).click();

    // Read the source data via the public style accessor. MapLibre's
    // GeoJSONSource keeps the assigned data in style.sources[id].data once
    // setData has been called.
    const segCoordCount = await page.evaluate(() => {
      const data = window.map.getStyle().sources['dir-active-segment'].data;
      return data && data.geometry ? data.geometry.coordinates.length : 0;
    });
    expect(segCoordCount).toBeGreaterThan(1);
  });

  test('zoom-to-step checkbox toggles cleanly', async ({ page }) => {
    const cb = page.locator('#zoomToStepCheckbox');
    await expect(cb).toBeChecked();
    await cb.uncheck();
    await expect(cb).not.toBeChecked();
    await cb.check();
    await expect(cb).toBeChecked();
  });

  test('zoom-to-step preference persists across page reloads via localStorage', async ({ page }) => {
    await page.locator('#zoomToStepCheckbox').uncheck();
    await expect(page.locator('#zoomToStepCheckbox')).not.toBeChecked();

    await page.reload();
    await page.waitForSelector('#map');
    await page.waitForFunction(() =>
      document.querySelectorAll('#directionsList .dir-step').length > 0
    );
    await expect(page.locator('#zoomToStepCheckbox')).not.toBeChecked();
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
    await page.locator('.dir-race-tab[data-race="sprint"]').click();
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

  test('toggling the zoom-to-step checkbox does not collapse the section', async ({ page }) => {
    const section = page.locator('#directionsSection');
    if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
      await page.locator('.directions-toggle').click();
    }
    await expect(section).toHaveClass(/expanded/);
    await page.locator('#zoomToStepCheckbox').uncheck();
    await expect(section).toHaveClass(/expanded/);
    await page.locator('#zoomToStepCheckbox').check();
    await expect(section).toHaveClass(/expanded/);
  });
});

test.describe('Tinman interactive directions: Sprint + Olympic distances', () => {
  // The interactive directions are race-agnostic — clicking Sprint or Olympic
  // in the race-cards section rebuilds the list, anchors active to step 1,
  // and rebinds the click + map highlight pipeline. These tests pin that
  // contract for the two shorter distances so a future race-specific change
  // can't silently break them.
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/tupper-lake-tinman/');
    await page.waitForSelector('#map');
    await page.waitForFunction(() =>
      window.map && window.map.loaded && window.map.loaded() &&
      window.map.getSource('dir-active-segment')
    );
    await page.waitForFunction(() =>
      document.querySelectorAll('#directionsList .dir-step').length > 0
    );
  });

  for (const race of [
    { id: 'sprint',  label: 'Sprint Run',  miles: '3.1 mi',  minSteps: 5 },
    { id: 'olympic', label: 'Olympic Run', miles: '6.2 mi',  minSteps: 12 },
  ]) {
    test(`${race.id}: race card switch rebuilds the list with the right header + count`, async ({ page }) => {
      await page.locator(`.dir-race-tab[data-race="${race.id}"]`).click();
      const label = page.locator('#directionsRaceLabel');
      await expect(label).toContainText(race.label);
      await expect(label).toContainText(race.miles);
      const stepCount = await page.locator('#directionsList .dir-step').count();
      expect(stepCount).toBeGreaterThanOrEqual(race.minSteps);
    });

    test(`${race.id}: switching to this race resets active to step 1`, async ({ page }) => {
      await page.locator(`.dir-race-tab[data-race="${race.id}"]`).click();
      const first = page.locator('#directionsList .dir-step').first();
      await expect(first).toHaveClass(/active/);
      const activeCount = await page.locator('#directionsList .dir-step.active').count();
      expect(activeCount).toBe(1);
    });

    test(`${race.id}: clicking a middle step updates the highlight pipeline`, async ({ page }) => {
      await page.locator(`.dir-race-tab[data-race="${race.id}"]`).click();
      const section = page.locator('#directionsSection');
      if (!(await section.evaluate(el => el.classList.contains('expanded')))) {
        await page.locator('.directions-toggle').click();
      }
      // Pick a non-trivial middle step (not the depart/arrive endpoints).
      const stepIdx = race.id === 'sprint' ? 2 : 5;
      await page.locator('#directionsList .dir-step').nth(stepIdx).click();
      await expect(page.locator('#directionsList .dir-step').nth(stepIdx)).toHaveClass(/active/);

      // The highlight pipeline should populate the segment source for
      // whichever race is currently active. (The pin source was removed in
      // feature_tinman_polish — the segment alone is the highlight now.)
      const result = await page.evaluate(() => ({
        segCoords: window.map.getStyle().sources['dir-active-segment'].data.geometry.coordinates.length,
        activeIdx: window.activeStepIdx,
        currentRaceId: window.currentRaceId,
      }));
      expect(result.currentRaceId).toBe(race.id);
      expect(result.activeIdx).toBe(stepIdx);
      expect(result.segCoords).toBeGreaterThan(1);
    });

    test(`${race.id}: snapped step miles are precomputed and monotonic`, async ({ page }) => {
      await page.locator(`.dir-race-tab[data-race="${race.id}"]`).click();
      const miles = await page.evaluate((id) => window.SNAPPED_STEP_MILES[id], race.id);
      expect(Array.isArray(miles)).toBe(true);
      expect(miles.length).toBeGreaterThan(2);
      // Monotonic non-decreasing (out-and-back routes can repeat at U-turns).
      for (let i = 1; i < miles.length; i++) {
        expect(miles[i], `${race.id} snapped mile at step ${i + 1} regressed`).toBeGreaterThanOrEqual(miles[i - 1] - 0.001);
      }
      // First step at 0, last step within 0.05 mi of the official total.
      const totalsByRace = { sprint: 3.1, olympic: 6.2 };
      expect(miles[0]).toBeCloseTo(0, 1);
      expect(Math.abs(miles[miles.length - 1] - totalsByRace[race.id])).toBeLessThan(0.05);
    });
  }

  test('in-panel race tabs are present, with Tinman selected by default', async ({ page }) => {
    const tabs = page.locator('.dir-race-tab');
    await expect(tabs).toHaveCount(3);
    const activeTab = page.locator('.dir-race-tab.active');
    await expect(activeTab).toHaveAttribute('data-race', 'tinman');
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');
    // Each tab labels its distance and shows a colored dot for the loop.
    await expect(page.locator('.dir-race-tab[data-race="sprint"]  .dir-race-mi')).toContainText('3.1');
    await expect(page.locator('.dir-race-tab[data-race="olympic"] .dir-race-mi')).toContainText('6.2');
    await expect(page.locator('.dir-race-tab[data-race="tinman"]  .dir-race-mi')).toContainText('13.1');
    await expect(page.locator('.dir-race-tab[data-race="sprint"]  .dir-race-dot')).toBeVisible();
  });

  test('clicking an in-panel race tab switches the directions list', async ({ page }) => {
    await page.locator('.dir-race-tab[data-race="olympic"]').click();
    await expect(page.locator('.dir-race-tab[data-race="olympic"]')).toHaveClass(/active/);
    await expect(page.locator('.dir-race-tab[data-race="olympic"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.dir-race-tab[data-race="tinman"]')).not.toHaveClass(/active/);
    await expect(page.locator('#directionsRaceLabel')).toContainText('Olympic');
    // First step active in the new race; map highlight pipeline populated.
    const first = page.locator('#directionsList .dir-step').first();
    await expect(first).toHaveClass(/active/);
  });

  test('race-tab and race-card selectors stay in sync', async ({ page }) => {
    // Switch via the bottom card; the in-panel tab should follow.
    await page.locator('.dir-race-tab[data-race="sprint"]').click();
    await expect(page.locator('.dir-race-tab[data-race="sprint"]')).toHaveClass(/active/);
    await expect(page.locator('.dir-race-tab[data-race="tinman"]')).not.toHaveClass(/active/);

    // Switch via the in-panel tab; the bottom card should follow.
    await page.locator('.dir-race-tab[data-race="tinman"]').click();
    await expect(page.locator('.dir-race-tab[data-race="tinman"]')).toHaveClass(/active/);
    await expect(page.locator('.dir-race-tab[data-race="sprint"]')).not.toHaveClass(/active/);
  });

  test('zoom-to-step preference stays in effect across race switches', async ({ page }) => {
    // Uncheck on Tinman, then switch to Sprint — preference should persist.
    await page.locator('#zoomToStepCheckbox').uncheck();
    await expect(page.locator('#zoomToStepCheckbox')).not.toBeChecked();

    await page.locator('.dir-race-tab[data-race="sprint"]').click();
    await expect(page.locator('#directionsRaceLabel')).toContainText('Sprint');
    await expect(page.locator('#zoomToStepCheckbox')).not.toBeChecked();
  });
});
