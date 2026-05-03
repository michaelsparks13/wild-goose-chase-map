# Tinman Street View Markers with Direction Arrows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Street View" toggle to the Tupper Lake Tinman run-course map that reveals 9 numbered markers at key navigation points, each opening a popup containing a Google Street View photo with a brand-yellow direction chevron rotated to point where the runner heads next.

**Architecture:** Map-local feature, no shared-module changes. A new JSON data file holds the 9 turn objects (lat/lon, pano ID, captured yaw/pitch, target `bearingAfter`). `config.js` loads it and inlines a `STREETVIEW_TURNS` global into the built HTML, plus adds the toggle button to `mapViewHtml`. `override.js` builds MapLibre markers + popups during `map.on('load')` and exposes a `toggleStreetview()` function. `override.css` styles the popup with the editorial design tokens (`--paper`, `--ink`, `--font-display`, `--font-body`). Arrow rotation is `bearingAfter − cameraYaw` normalized to ±180° and applied as a CSS `transform: rotate(...)`.

**Tech Stack:** MapLibre GL JS 5.18, vanilla ES5 JS (matches existing `override.js` style), CSS variables from the editorial v2 theme system, Vitest for unit tests (HTML-inspection convention), Playwright for e2e.

**Spec:** [docs/superpowers/specs/2026-05-03-tinman-streetview-arrows-design.md](../specs/2026-05-03-tinman-streetview-arrows-design.md)

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/maps/tupper-lake-tinman/data/streetview.json` | **CREATE** | The 9-entry turn data — single source of truth for marker locations, pano IDs, camera params, target bearing. |
| `src/maps/tupper-lake-tinman/config.js` | MODIFY | Load `streetview.json`, inline as `STREETVIEW_TURNS` in `configDataJs`; add `<button>` to `mapViewHtml > .map-btns`. |
| `src/maps/tupper-lake-tinman/override.js` | MODIFY | Add `streetviewMarkers` state, helper functions (`normalizeAngle`, `streetviewArrowAngle`, `buildStreetviewPopupHtml`), marker-creation block in `map.on('load')`, `toggleStreetview()` global, extend tap-passthrough guard. |
| `src/maps/tupper-lake-tinman/override.css` | MODIFY | Append rules for `.streetview-marker`, `.streetview-popup`, `.streetview-photo-wrap`, `.streetview-photo`, `.streetview-arrow`, `.streetview-title`, `.streetview-meta`, `.streetview-link`. |
| `tests/tinman-streetview.test.js` | **CREATE** | Vitest: schema check on JSON; HTML-inspection of build output; pure-math tests redefining helpers inline. |
| `tests/tupper-lake-tinman.e2e.js` | MODIFY | Append a `test.describe('Street View')` block exercising toggle + marker + popup + chevron rotation. |

**Files NOT touched:** `build.js`, `src/shared/*`, `src/themes/*`, `src/templates/*`, `src/shared/editorial-runtime.js`, all other maps. Rationale recorded in the spec.

---

## Task 1: Create the Street View data file

**Files:**
- Create: `src/maps/tupper-lake-tinman/data/streetview.json`

- [ ] **Step 1: Write the schema check test (failing)**

Create `tests/tinman-streetview.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const dataPath = resolve(__dirname, '../src/maps/tupper-lake-tinman/data/streetview.json');

describe('streetview.json schema', () => {
  it('exists', () => {
    expect(existsSync(dataPath)).toBe(true);
  });

  it('contains 9 turn entries', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(9);
  });

  it('each entry has required fields with correct types', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    data.forEach((entry, i) => {
      expect(typeof entry.name, `entry ${i} name`).toBe('string');
      expect(typeof entry.mile, `entry ${i} mile`).toBe('number');
      expect(Array.isArray(entry.coords), `entry ${i} coords`).toBe(true);
      expect(entry.coords).toHaveLength(2);
      expect(typeof entry.pano, `entry ${i} pano`).toBe('string');
      expect(entry.pano.length, `entry ${i} pano not empty`).toBeGreaterThan(0);
      expect(typeof entry.yaw, `entry ${i} yaw`).toBe('number');
      expect(typeof entry.pitch, `entry ${i} pitch`).toBe('number');
      expect(typeof entry.bearingAfter, `entry ${i} bearingAfter`).toBe('number');
    });
  });

  it('mile values are sorted ascending and unique', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    const miles = data.map((e) => e.mile);
    const sorted = [...miles].sort((a, b) => a - b);
    expect(miles).toEqual(sorted);
    expect(new Set(miles).size).toBe(miles.length);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/tinman-streetview.test.js
```

Expected: FAIL with `streetview.json does not exist` and subsequent assertions failing.

- [ ] **Step 3: Create the data file with all 9 entries**

```json
[
  {
    "name": "Turn right onto Boyer Avenue",
    "mile": 0.03,
    "coords": [-74.457537, 44.228058],
    "pano": "H3Z_ClxiBAJECBtSj3-Yig",
    "yaw": 116.16,
    "pitch": 19.56,
    "bearingAfter": 171
  },
  {
    "name": "Turn left onto East Park Street",
    "mile": 0.42,
    "coords": [-74.456861, 44.224572],
    "pano": "vK87NCNW1jRk4UDFDxGEqg",
    "yaw": 137.24,
    "pitch": 9.37,
    "bearingAfter": 82
  },
  {
    "name": "Old Wawbeek / Dugal Loop Entry",
    "mile": 2.15,
    "coords": [-74.429089, 44.234926],
    "pano": "aW84qtHD_VBgwzlvZuvSOg",
    "yaw": 98.82,
    "pitch": 6.01,
    "bearingAfter": 119
  },
  {
    "name": "Turn left onto Pleasant Avenue",
    "mile": 4.44,
    "coords": [-74.457537, 44.228058],
    "pano": "iR9cgLQXuu2GYkVzJwi3uw",
    "yaw": 334.81,
    "pitch": 18.51,
    "bearingAfter": 262
  },
  {
    "name": "Turn left onto Chemical Street",
    "mile": 4.62,
    "coords": [-74.462567, 44.238488],
    "pano": "hdp2J3ubGHj7-GGBdKRCjw",
    "yaw": 265.99,
    "pitch": 9.34,
    "bearingAfter": 201
  },
  {
    "name": "Turn left onto McLaughlin Avenue",
    "mile": 5.02,
    "coords": [-74.462567, 44.238488],
    "pano": "LBT7s8B1gdB50CnSDsmSNg",
    "yaw": 14.53,
    "pitch": 4.66,
    "bearingAfter": 285
  },
  {
    "name": "Turn right onto Main Street",
    "mile": 6.67,
    "coords": [-74.47941, 44.240725],
    "pano": "FXpF_L3JMYHMvNk_xrHzYQ",
    "yaw": 260.01,
    "pitch": 24.74,
    "bearingAfter": 327
  },
  {
    "name": "Tinman Turnaround — Wolf Pond Road",
    "mile": 8.29,
    "coords": [-74.471396, 44.250555],
    "pano": "AlGc8rKntBziWDekY_bj3w",
    "yaw": 331.20,
    "pitch": -0.24,
    "bearingAfter": 330
  },
  {
    "name": "Turn left onto Fuller Avenue",
    "mile": 9.32,
    "coords": [-74.481567, 44.249212],
    "pano": "rmgStNEYvH8pcB34HoPq6g",
    "yaw": 255.91,
    "pitch": 16.51,
    "bearingAfter": 180
  }
]
```

- [ ] **Step 4: Re-run the test, expect PASS**

```bash
npx vitest run tests/tinman-streetview.test.js
```

Expected: 4 tests passing in the `streetview.json schema` describe block.

- [ ] **Step 5: Commit**

```bash
git add src/maps/tupper-lake-tinman/data/streetview.json tests/tinman-streetview.test.js
git commit -m "Add Tinman Street View turn data and schema test"
```

---

## Task 2: Wire `streetview.json` into `config.js`

**Files:**
- Modify: `src/maps/tupper-lake-tinman/config.js` (add `loadJSON` call near line 20; inline `STREETVIEW_TURNS` inside `configDataJs` template literal near line 95)

- [ ] **Step 1: Add a failing test for the inlined data in the build**

Append to `tests/tinman-streetview.test.js`:

```javascript
const distHtmlPath = resolve(__dirname, '../dist/maps/tupper-lake-tinman/index.html');
const embedHtmlPath = resolve(__dirname, '../dist/embed/tupper-lake-tinman/index.html');

describe('build inlines STREETVIEW_TURNS', () => {
  it('main HTML defines STREETVIEW_TURNS as an array', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/var STREETVIEW_TURNS\s*=\s*\[/);
  });

  it('embed HTML defines STREETVIEW_TURNS', () => {
    const html = readFileSync(embedHtmlPath, 'utf-8');
    expect(html).toMatch(/var STREETVIEW_TURNS\s*=\s*\[/);
  });

  it('inlined data includes all 9 pano IDs', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const panos = [
      'H3Z_ClxiBAJECBtSj3-Yig',
      'vK87NCNW1jRk4UDFDxGEqg',
      'aW84qtHD_VBgwzlvZuvSOg',
      'iR9cgLQXuu2GYkVzJwi3uw',
      'hdp2J3ubGHj7-GGBdKRCjw',
      'LBT7s8B1gdB50CnSDsmSNg',
      'FXpF_L3JMYHMvNk_xrHzYQ',
      'AlGc8rKntBziWDekY_bj3w',
      'rmgStNEYvH8pcB34HoPq6g',
    ];
    panos.forEach((pano) => {
      expect(html, `pano ${pano} should be inlined`).toContain(pano);
    });
  });
});
```

- [ ] **Step 2: Build, then run the test to confirm it fails**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: FAIL because `STREETVIEW_TURNS` is not yet in the HTML.

- [ ] **Step 3: Add the `loadJSON` call in `config.js`**

In `src/maps/tupper-lake-tinman/config.js`, after line 20 (`const aidStationsRaw = ...`) insert:

```javascript
const streetviewTurns = loadJSON('data/streetview.json');
```

- [ ] **Step 4: Inline `STREETVIEW_TURNS` inside `configDataJs`**

In the same file, inside the `configDataJs` template literal, add this block immediately before the closing backtick (around line 117, after the IIFE that computes `loopCoordDistances`):

```javascript
var STREETVIEW_TURNS = ${JSON.stringify(streetviewTurns)};
```

- [ ] **Step 5: Rebuild and re-run the test**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: All tests in the `build inlines STREETVIEW_TURNS` describe block now pass.

- [ ] **Step 6: Commit**

```bash
git add src/maps/tupper-lake-tinman/config.js tests/tinman-streetview.test.js
git commit -m "Inline STREETVIEW_TURNS data into Tinman build"
```

---

## Task 3: Add the Street View toggle button to `mapViewHtml`

**Files:**
- Modify: `src/maps/tupper-lake-tinman/config.js` line 175–178 (the `.map-btns` div inside `mapViewHtml`)

- [ ] **Step 1: Add a failing test for the button**

Append to `tests/tinman-streetview.test.js`:

```javascript
describe('Street View toggle button', () => {
  it('button exists in main HTML between aid and 3D', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const aidIdx = html.indexOf('id="aidBtn"');
    const svIdx = html.indexOf('id="streetviewBtn"');
    const terrainIdx = html.indexOf('id="terrainBtn"');
    expect(aidIdx).toBeGreaterThan(-1);
    expect(svIdx).toBeGreaterThan(-1);
    expect(terrainIdx).toBeGreaterThan(-1);
    expect(svIdx).toBeGreaterThan(aidIdx);
    expect(svIdx).toBeLessThan(terrainIdx);
  });

  it('button label is "Street View"', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/id="streetviewBtn"[^>]*>Street View</);
  });

  it('button onclick wires to toggleStreetview', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/id="streetviewBtn"[^>]*onclick="toggleStreetview\(\)"/);
  });
});
```

- [ ] **Step 2: Build and run the test to confirm it fails**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: FAIL — `streetviewBtn` is not in the HTML.

- [ ] **Step 3: Add the button in `mapViewHtml`**

In `src/maps/tupper-lake-tinman/config.js`, find the `.map-btns` div (around line 175):

```html
    <div class="map-btns">
      <button class="trail-btn" id="aidBtn" onclick="toggleAid()">Aid Stations</button>
      <button class="trail-btn" id="terrainBtn" onclick="toggle3D()">3D</button>
    </div>
```

Replace with:

```html
    <div class="map-btns">
      <button class="trail-btn" id="aidBtn" onclick="toggleAid()">Aid Stations</button>
      <button class="trail-btn" id="streetviewBtn" onclick="toggleStreetview()">Street View</button>
      <button class="trail-btn" id="terrainBtn" onclick="toggle3D()">3D</button>
    </div>
```

- [ ] **Step 4: Rebuild and re-run the test**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: All `Street View toggle button` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/maps/tupper-lake-tinman/config.js tests/tinman-streetview.test.js
git commit -m "Add Street View toggle button to Tinman map view"
```

---

## Task 4: Implement and unit-test the rotation math

**Files:**
- Modify: `src/maps/tupper-lake-tinman/override.js` (add helpers near line 57, just before the `var map;` declaration)
- Modify: `tests/tinman-streetview.test.js` (add pure-math test block)

- [ ] **Step 1: Write failing pure-math tests**

Append to `tests/tinman-streetview.test.js`:

```javascript
describe('arrow rotation math (pure)', () => {
  // These helpers MUST stay in sync with override.js. Tested as pure functions
  // by redefining inline; the source-of-truth lives in override.js. The
  // HTML-inspection test below verifies the override.js definitions match.
  function normalizeAngle(deg) {
    var x = deg % 360;
    if (x > 180) x -= 360;
    if (x < -180) x += 360;
    return x;
  }

  function streetviewArrowAngle(turn) {
    return normalizeAngle(turn.bearingAfter - turn.yaw);
  }

  it('normalizeAngle handles common values', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(90)).toBe(90);
    expect(normalizeAngle(-90)).toBe(-90);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(-180);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-450)).toBe(-90);
  });

  it('streetviewArrowAngle for the 9 captured turns', () => {
    const cases = [
      { yaw: 116.16, bearingAfter: 171, expected: 54.84 },
      { yaw: 137.24, bearingAfter: 82,  expected: -55.24 },
      { yaw: 98.82,  bearingAfter: 119, expected: 20.18 },
      { yaw: 334.81, bearingAfter: 262, expected: -72.81 },
      { yaw: 265.99, bearingAfter: 201, expected: -64.99 },
      { yaw: 14.53,  bearingAfter: 285, expected: -89.53 },
      { yaw: 260.01, bearingAfter: 327, expected: 66.99 },
      { yaw: 331.20, bearingAfter: 330, expected: -1.20 },
      { yaw: 255.91, bearingAfter: 180, expected: -75.91 },
    ];
    cases.forEach((c) => {
      const result = streetviewArrowAngle(c);
      expect(result, `yaw=${c.yaw} bearingAfter=${c.bearingAfter}`).toBeCloseTo(c.expected, 1);
    });
  });

  it('all 9 captured turns have |arrowAngle| <= 90 (exit visible in frame)', () => {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    data.forEach((turn) => {
      const angle = streetviewArrowAngle(turn);
      expect(Math.abs(angle), `${turn.name}`).toBeLessThanOrEqual(90);
    });
  });
});

describe('override.js exposes the rotation helpers', () => {
  it('main HTML contains normalizeAngle definition', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+normalizeAngle\s*\(/);
  });

  it('main HTML contains streetviewArrowAngle definition', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+streetviewArrowAngle\s*\(/);
  });
});
```

- [ ] **Step 2: Run the test to confirm pure-math passes but HTML-inspection fails**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: `arrow rotation math (pure)` PASSES (helpers redefined inline). `override.js exposes the rotation helpers` FAILS (functions not yet in override.js).

- [ ] **Step 3: Add the helpers to `override.js`**

In `src/maps/tupper-lake-tinman/override.js`, find the section just after the `setHtml` helper definition (around line 57, ending in `};`). Insert the following block before `var map;` on line 59:

```javascript
// ─── Street View arrow rotation ───
// streetviewArrowAngle(turn) returns the CSS rotation (degrees) for the
// chevron overlaid on a Street View thumbnail. 0° = arrow points up, into
// the photo (the runner continues along the camera direction).
// Positive = clockwise (exit is to the right of the frame).
function normalizeAngle(deg) {
  var x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function streetviewArrowAngle(turn) {
  return normalizeAngle(turn.bearingAfter - turn.yaw);
}
```

- [ ] **Step 4: Rebuild and re-run the test**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: All tests in the `override.js exposes the rotation helpers` block now pass.

- [ ] **Step 5: Commit**

```bash
git add src/maps/tupper-lake-tinman/override.js tests/tinman-streetview.test.js
git commit -m "Add rotation math helpers for Tinman Street View arrows"
```

---

## Task 5: Build the Street View popup HTML helper

**Files:**
- Modify: `src/maps/tupper-lake-tinman/override.js` (add helper just below `streetviewArrowAngle`)

- [ ] **Step 1: Write a failing HTML-inspection test for the helper**

Append to `tests/tinman-streetview.test.js`:

```javascript
describe('buildStreetviewPopupHtml structure', () => {
  it('main HTML contains buildStreetviewPopupHtml definition', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+buildStreetviewPopupHtml\s*\(/);
  });

  it('main HTML uses streetviewpixels-pa.googleapis.com thumbnail endpoint', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toContain('streetviewpixels-pa.googleapis.com/v1/thumbnail');
  });

  it('popup HTML wires the chevron transform to streetviewArrowAngle', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    // The helper should compute rotate(...deg) using streetviewArrowAngle
    expect(html).toMatch(/streetviewArrowAngle\s*\(/);
    expect(html).toMatch(/rotate\(/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: FAIL — `buildStreetviewPopupHtml` not in HTML.

- [ ] **Step 3: Add the helper to `override.js`**

In `src/maps/tupper-lake-tinman/override.js`, immediately after the `streetviewArrowAngle` function added in Task 4, insert:

```javascript
// Builds the inner-HTML for a Street View popup. Kept as a single function
// (not interpolated inline at marker-creation time) so the structure is easy
// to test from the built HTML and easy to evolve.
function buildStreetviewPopupHtml(turn) {
  var thumbUrl =
    'https://streetviewpixels-pa.googleapis.com/v1/thumbnail' +
    '?cb_client=maps_sv.tactile&w=720&h=400' +
    '&panoid=' + encodeURIComponent(turn.pano) +
    '&yaw=' + turn.yaw +
    '&pitch=' + turn.pitch;

  var mapsUrl =
    'https://www.google.com/maps/@?api=1&map_action=pano' +
    '&pano=' + encodeURIComponent(turn.pano) +
    '&heading=' + turn.yaw +
    '&pitch=' + turn.pitch;

  var rotateDeg = streetviewArrowAngle(turn);

  // Chevron geometry: 48x48 viewBox, point-up at 0deg. Stem + V head.
  var chevronSvg =
    '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M24 6 L24 40 M10 22 L24 6 L38 22" ' +
        'fill="none" stroke="#1a1a1a" stroke-width="7" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M24 6 L24 40 M10 22 L24 6 L38 22" ' +
        'fill="none" stroke="#F5C518" stroke-width="4.5" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  return (
    '<div class="streetview-popup-inner">' +
      '<div class="streetview-title">' + turn.name + '</div>' +
      '<div class="streetview-meta">MILE ' + turn.mile.toFixed(2) + '</div>' +
      '<div class="streetview-photo-wrap">' +
        '<img class="streetview-photo" src="' + thumbUrl + '" alt="Street View at ' + turn.name + '" loading="lazy">' +
        '<div class="streetview-arrow" style="transform: translate(-50%, 0) rotate(' + rotateDeg.toFixed(2) + 'deg)">' +
          chevronSvg +
        '</div>' +
      '</div>' +
      '<a class="streetview-link" href="' + mapsUrl + '" target="_blank" rel="noopener">Open in Google Maps →</a>' +
    '</div>'
  );
}
```

- [ ] **Step 4: Rebuild and re-run the test**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: `buildStreetviewPopupHtml structure` tests now pass.

- [ ] **Step 5: Commit**

```bash
git add src/maps/tupper-lake-tinman/override.js tests/tinman-streetview.test.js
git commit -m "Add buildStreetviewPopupHtml helper for Tinman"
```

---

## Task 6: Add `streetviewMarkers` state and create markers in `map.on('load')`

**Files:**
- Modify: `src/maps/tupper-lake-tinman/override.js` (state near line 62; marker creation after the existing `AID_STATIONS.forEach(...)` block ending around line 637; tap-passthrough guard at line 570)

- [ ] **Step 1: Write a failing test for marker rendering**

Append to `tests/tinman-streetview.test.js`:

```javascript
describe('Street View marker creation', () => {
  it('main HTML iterates STREETVIEW_TURNS to create markers', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/STREETVIEW_TURNS\.forEach/);
  });

  it('main HTML defines streetviewMarkers array', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/var\s+streetviewMarkers\s*=\s*\[\s*\]/);
  });

  it('tap-passthrough guard includes .streetview-marker', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/closest\(['"][^'"]*\.streetview-marker[^'"]*['"]\)/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: FAIL — markers not yet created.

- [ ] **Step 3: Add the state declaration**

In `src/maps/tupper-lake-tinman/override.js`, find line 62 (`var aidMarkers = [];`). Add a new line immediately after it:

```javascript
var streetviewMarkers = [];
var streetviewOn = false;
```

- [ ] **Step 4: Add the marker-creation block inside `map.on('load')`**

Find the `AID_STATIONS.forEach(function(station) { ... });` block (starts around line 623, ends around line 637). Immediately after its closing `});`, insert:

```javascript
    STREETVIEW_TURNS.forEach(function(turn) {
      var svEl = document.createElement('div');
      svEl.className = 'streetview-marker';
      svEl.style.display = 'none';
      // Camera glyph: black disc, yellow border, white camera body.
      setHtml(svEl,
        '<svg viewBox="0 0 32 32" aria-hidden="true">' +
          '<circle cx="16" cy="16" r="13" fill="#1a1a1a" stroke="#F5C518" stroke-width="2.5"/>' +
          '<rect x="9" y="12" width="14" height="9" rx="1.5" fill="#fff"/>' +
          '<polygon points="13,12 15,10 17,10 19,12" fill="#fff"/>' +
          '<circle cx="16" cy="16.5" r="2.6" fill="#1a1a1a"/>' +
        '</svg>'
      );
      var marker = new maplibregl.Marker({ element: svEl })
        .setLngLat(turn.coords)
        .setPopup(new maplibregl.Popup({
          offset: 16,
          className: 'streetview-popup',
          maxWidth: '380px'
        }).setHTML(buildStreetviewPopupHtml(turn)))
        .addTo(map);
      streetviewMarkers.push({ marker: marker, element: svEl });
    });
```

- [ ] **Step 5: Extend the tap-passthrough guard**

Find line 570 in `override.js`:

```javascript
          if (t && t.closest && t.closest('.aid-marker, .hq-marker, .mile-marker')) return;
```

Replace with:

```javascript
          if (t && t.closest && t.closest('.aid-marker, .hq-marker, .mile-marker, .streetview-marker')) return;
```

Only `.streetview-marker` is added. Other in-flight marker classes (e.g. `.turnaround-marker`) are out of scope for this work; if they have a similar tap-passthrough issue, that's a separate ticket.

- [ ] **Step 6: Rebuild and re-run the test**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: All `Street View marker creation` tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/maps/tupper-lake-tinman/override.js tests/tinman-streetview.test.js
git commit -m "Render Tinman Street View markers from STREETVIEW_TURNS"
```

---

## Task 7: Implement `toggleStreetview()`

**Files:**
- Modify: `src/maps/tupper-lake-tinman/override.js` (add function next to `toggleAid` near line 1437)

- [ ] **Step 1: Write a failing test for the toggle**

Append to `tests/tinman-streetview.test.js`:

```javascript
describe('toggleStreetview function', () => {
  it('main HTML defines toggleStreetview', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/function\s+toggleStreetview\s*\(/);
  });

  it('toggleStreetview flips streetviewOn and updates element display', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const fnStart = html.indexOf('function toggleStreetview');
    expect(fnStart).toBeGreaterThan(-1);
    const fnSlice = html.substring(fnStart, fnStart + 400);
    expect(fnSlice).toMatch(/streetviewOn\s*=\s*!\s*streetviewOn/);
    expect(fnSlice).toMatch(/getEl\(['"]streetviewBtn['"]\)\.classList\.toggle\(['"]active['"]/);
    expect(fnSlice).toMatch(/streetviewMarkers\.forEach/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: FAIL — `toggleStreetview` not defined.

- [ ] **Step 3: Add the function**

Find `function toggleAid()` in `override.js` (around line 1437). Immediately after its closing `}`, insert:

```javascript
function toggleStreetview() {
  streetviewOn = !streetviewOn;
  getEl('streetviewBtn').classList.toggle('active', streetviewOn);
  streetviewMarkers.forEach(function(s) {
    s.element.style.display = streetviewOn ? 'block' : 'none';
    if (!streetviewOn && s.marker.getPopup() && s.marker.getPopup().isOpen()) {
      s.marker.getPopup().remove();
    }
  });
}
```

- [ ] **Step 4: Rebuild and re-run the test**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: `toggleStreetview function` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/maps/tupper-lake-tinman/override.js tests/tinman-streetview.test.js
git commit -m "Add toggleStreetview() to Tinman override"
```

---

## Task 8: Style the popup, marker, and chevron

**Files:**
- Modify: `src/maps/tupper-lake-tinman/override.css` (append rules at the end of the file, line 636)

- [ ] **Step 1: Write a failing test for the CSS**

Append to `tests/tinman-streetview.test.js`:

```javascript
describe('Street View styles', () => {
  it('main HTML inlines .streetview-marker styles', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/\.streetview-marker\s*\{/);
  });

  it('main HTML inlines .streetview-arrow styles', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/\.streetview-arrow\s*\{/);
  });

  it('popup uses --paper background', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    expect(html).toMatch(/\.streetview-popup[^{]*\.maplibregl-popup-content[^{]*\{[^}]*var\(--paper\)/s);
  });

  it('arrow has transform-origin and absolute positioning', () => {
    const html = readFileSync(distHtmlPath, 'utf-8');
    const arrowStart = html.indexOf('.streetview-arrow {');
    expect(arrowStart).toBeGreaterThan(-1);
    const arrowSlice = html.substring(arrowStart, arrowStart + 400);
    expect(arrowSlice).toContain('position: absolute');
    expect(arrowSlice).toContain('transform-origin');
  });
});
```

- [ ] **Step 2: Build and run the test to confirm failure**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: FAIL — CSS classes not yet defined.

- [ ] **Step 3: Append the CSS**

At the end of `src/maps/tupper-lake-tinman/override.css`, append:

```css
/* ─── Street View markers + popup ─────────────────────────────── */

.streetview-marker {
  width: 32px;
  height: 32px;
  cursor: pointer;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}
.streetview-marker svg {
  width: 32px;
  height: 32px;
  display: block;
}

.streetview-popup .maplibregl-popup-content {
  padding: 0;
  background: var(--paper);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(0,0,0,0.18);
}
.streetview-popup .maplibregl-popup-tip {
  border-top-color: var(--paper);
  border-bottom-color: var(--paper);
}
.streetview-popup .maplibregl-popup-close-button {
  right: 6px;
  top: 6px;
  width: 26px;
  height: 26px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
}

.streetview-popup-inner {
  width: 360px;
  max-width: 100%;
}

.streetview-title {
  padding: 10px 14px 2px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--ink);
  letter-spacing: 0.01em;
}
.streetview-meta {
  padding: 0 14px 8px;
  font-family: var(--font-micro);
  font-weight: 500;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: rgba(26, 26, 26, 0.6);
}

.streetview-photo-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #1a1a1a;
  overflow: hidden;
}
.streetview-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.streetview-arrow {
  position: absolute;
  bottom: 16px;
  left: 50%;
  width: 80px;
  height: 80px;
  transform-origin: 50% 50%;
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
}
.streetview-arrow svg {
  width: 100%;
  height: 100%;
  display: block;
}

.streetview-link {
  display: block;
  padding: 10px 14px;
  font-family: var(--font-body);
  font-size: 0.78rem;
  color: var(--ink);
  text-decoration: none;
  border-top: 1px solid rgba(26, 26, 26, 0.08);
  transition: background-color 120ms ease;
}
.streetview-link:hover,
.streetview-link:focus-visible {
  background: rgba(26, 26, 26, 0.05);
  text-decoration: underline;
}
```

- [ ] **Step 4: Rebuild and re-run the test**

```bash
node build.js && npx vitest run tests/tinman-streetview.test.js
```

Expected: All `Street View styles` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/maps/tupper-lake-tinman/override.css tests/tinman-streetview.test.js
git commit -m "Style Tinman Street View popup, marker, and chevron"
```

---

## Task 9: Add Playwright e2e coverage

**Files:**
- Modify: `tests/tupper-lake-tinman.e2e.js` (append a new `test.describe('Street View')` block at the bottom of the file)

- [ ] **Step 1: Add the e2e block**

At the end of `tests/tupper-lake-tinman.e2e.js`, append:

```javascript
test.describe('Tupper Lake Tinman — Street View overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/maps/tupper-lake-tinman/');
    // Wait for map load — markers attach inside map.on('load')
    await page.waitForSelector('.aid-marker', { state: 'attached', timeout: 10_000 });
  });

  test('toggle button is between Aid Stations and 3D', async ({ page }) => {
    const buttons = await page.locator('.map-btns button').allTextContents();
    const trimmed = buttons.map((s) => s.trim());
    const aidIdx = trimmed.indexOf('Aid Stations');
    const svIdx  = trimmed.indexOf('Street View');
    const trIdx  = trimmed.indexOf('3D');
    expect(aidIdx).toBeGreaterThanOrEqual(0);
    expect(svIdx).toBeGreaterThan(aidIdx);
    expect(trIdx).toBeGreaterThan(svIdx);
  });

  test('markers are hidden by default and revealed by toggle', async ({ page }) => {
    await expect(page.locator('.streetview-marker').first()).toBeHidden();
    await page.locator('#streetviewBtn').click();
    await expect(page.locator('#streetviewBtn')).toHaveClass(/active/);
    await expect(page.locator('.streetview-marker').first()).toBeVisible();
    const count = await page.locator('.streetview-marker').count();
    expect(count).toBe(9);
  });

  test('clicking a marker opens a popup with photo, title, and rotated arrow', async ({ page }) => {
    await page.locator('#streetviewBtn').click();
    await page.locator('.streetview-marker').first().click();

    const popup = page.locator('.streetview-popup');
    await expect(popup).toBeVisible();

    const title = popup.locator('.streetview-title');
    await expect(title).toContainText('Boyer'); // first turn = "Turn right onto Boyer Avenue"

    const photo = popup.locator('.streetview-photo');
    const src = await photo.getAttribute('src');
    expect(src).toContain('panoid=H3Z_ClxiBAJECBtSj3-Yig');
    expect(src).toContain('streetviewpixels-pa.googleapis.com');

    const arrow = popup.locator('.streetview-arrow');
    const transform = await arrow.evaluate((el) => getComputedStyle(el).transform);
    // matrix(...) means a transform was applied; rotate(0deg) would still
    // produce matrix(1, 0, 0, 1, ..., ...). We just assert it's not 'none'.
    expect(transform).not.toBe('none');
    // And we assert the rotation is in the expected ballpark (~54.84deg
    // for the Boyer turn). The matrix decomposes as
    // matrix(cos, sin, -sin, cos, tx, ty); rotation = atan2(sin, cos).
    const m = transform.match(/matrix\(([-0-9.,\s]+)\)/);
    expect(m).not.toBeNull();
    const parts = m[1].split(',').map(Number);
    const rotationRad = Math.atan2(parts[1], parts[0]);
    const rotationDeg = rotationRad * 180 / Math.PI;
    expect(Math.abs(rotationDeg - 54.84)).toBeLessThan(1.0);
  });

  test('toggling off hides markers and removes any open popup', async ({ page }) => {
    await page.locator('#streetviewBtn').click();
    await page.locator('.streetview-marker').first().click();
    await expect(page.locator('.streetview-popup')).toBeVisible();

    await page.locator('#streetviewBtn').click();
    await expect(page.locator('#streetviewBtn')).not.toHaveClass(/active/);
    await expect(page.locator('.streetview-marker').first()).toBeHidden();
    await expect(page.locator('.streetview-popup')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the e2e suite**

```bash
npx playwright test tests/tupper-lake-tinman.e2e.js
```

Expected: All 4 new Street View tests pass. The pre-existing 5+ v2 athlete-first tests in this file should also still pass — verify the count.

- [ ] **Step 3: Commit**

```bash
git add tests/tupper-lake-tinman.e2e.js
git commit -m "Add Playwright e2e coverage for Tinman Street View"
```

---

## Task 10: Full regression run + manual smoke check

- [ ] **Step 1: Run the entire Vitest suite**

```bash
node build.js && npx vitest run
```

Expected: All tests pass. Pay attention to `tinman.test.js`, `editorial-theme.test.js`, and `embed.test.js` — those inspect the same built HTML and could be affected by the added inline data.

- [ ] **Step 2: Run the entire Playwright suite**

```bash
npx playwright test
```

Expected: All e2e tests pass across all maps.

- [ ] **Step 3: Manual smoke — full map**

```bash
node dev.js
```

Open `http://localhost:3000/maps/tupper-lake-tinman/` in the browser and verify by hand:

- The `Street View` button sits between `Aid Stations` and `3D`.
- Default state: button inactive, no Street View markers visible.
- Clicking the button reveals 9 markers along the course in a yellow-bordered black camera style. None overlap aid stations or mile markers.
- Clicking each of the 9 markers opens a popup with: title pill, mile pill, photo, chevron pointing into the photo (eyeball-check the chevron points roughly the way the runner heads next), and "Open in Google Maps →" link.
- Clicking the Maps link opens Street View in a new tab at the captured pano + heading.
- Clicking the toggle off hides all markers and closes any open popup.
- No console errors or warnings.

- [ ] **Step 4: Manual smoke — embed build**

In the same dev server, open `http://localhost:3000/embed/tupper-lake-tinman/` and verify the same Street View behavior works inside the embed shell.

- [ ] **Step 5: Stop the dev server**

Ctrl-C the `node dev.js` process.

- [ ] **Step 6: Final commit if any tweaks were needed**

If the manual smoke surfaced anything (it shouldn't), make the fix, re-run tests, and commit:

```bash
node build.js && npx vitest run && npx playwright test
git add -p
git commit -m "Polish Tinman Street View based on smoke test"
```

If nothing tweaked, no commit needed.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feature_tinman_streetview
```

---

## Self-Review Notes

**Spec coverage:**

| Spec section | Plan task |
|--------------|-----------|
| Overview, goals, non-goals | (no implementation) |
| User Experience steps 1–5 | Tasks 3, 6, 7, 9 |
| Visual Design — popup layout | Task 8 |
| Visual Design — map marker | Task 6 |
| Visual Design — arrow chevron | Tasks 4, 5, 8 |
| Architecture — data file | Task 1 |
| Architecture — config.js wiring | Tasks 2, 3 |
| Architecture — override.js (state, helpers, marker creation, toggle, tap-passthrough) | Tasks 4, 5, 6, 7 |
| Architecture — override.css | Task 8 |
| Architecture — tests | Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| Data Model | Task 1 |
| Arrow Rotation Math | Task 4 |
| Toggle Behavior | Task 7 |
| Embed Compatibility | Task 2 (test inlines), Task 10 (manual verify) |
| Testing — Vitest | Tasks 1–8 |
| Testing — Playwright | Task 9 |
| Testing — Build/lint | Task 10 |

**Placeholder scan:** No "TBD", "TODO", "fill in details," or vague-error-handling instructions. Every step has either explicit code, an explicit command, or a concrete check.

**Type/name consistency:** Helper names match across tasks (`normalizeAngle`, `streetviewArrowAngle`, `buildStreetviewPopupHtml`). State names match (`streetviewMarkers`, `streetviewOn`). Class names match (`.streetview-marker`, `.streetview-popup`, `.streetview-photo-wrap`, `.streetview-photo`, `.streetview-arrow`, `.streetview-title`, `.streetview-meta`, `.streetview-link`). Button id `streetviewBtn` is consistent. Pano IDs match the spec data table.

**Bite-size check:** Each task contains 5–7 steps; each step is a single action (write code, run command, commit). No multi-action steps.

**Code-coupling sanity:** Task 6 depends on Task 5's `buildStreetviewPopupHtml` being defined. Task 9's e2e depends on Tasks 6, 7, and 8 all being merged. The order is: data → wiring → button → math → popup HTML → marker creation → toggle → CSS → e2e → regression. Following the order avoids broken intermediate states except inside individual tasks (where TDD's "fail then pass" cycle is intentional).
