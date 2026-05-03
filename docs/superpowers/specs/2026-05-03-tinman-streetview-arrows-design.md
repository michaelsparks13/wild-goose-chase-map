# Tinman Street View Markers with Direction Arrows

**Date:** 2026-05-03
**Branch:** `feature_tinman_streetview` (cut from `main` after the editorial / athlete-first v2 redesign merged at `e3b96c5`)
**Map:** `src/maps/tupper-lake-tinman`
**Status:** Design — pending user approval before implementation

> **Note (architecture revision):** This spec was originally drafted against `src/maps/tinman/`. The athlete-first v2 redesign renamed the map slug to `tupper-lake-tinman`, introduced a `src/themes/` directory with a `RaceTheme` object per map, and shifted the CSS token vocabulary toward `--paper` / `--ink` / `--font-display` / `--font-body` / `--font-micro`. All paths and tokens below reflect the post-merge structure. The Street View design itself — popup layout, arrow rotation math, marker behavior — is unchanged.

## Overview

Add a toggleable "Street View" layer to the Tinman run-course map. When activated, 9 numbered markers appear at key navigation points along the course. Clicking a marker opens a popup containing a Google Street View thumbnail with a brand-yellow direction chevron overlaid on the photo, indicating the way the runner heads next from that vantage. Captions name the turn and mile.

The feature reuses the Street View popup pattern established in `src/maps/wild-goose/override.js`, but extends it with a freely-rotating arrow overlay driven by the per-step bearing data already present in `src/maps/tinman/data/tinman-steps.json`.

## Goals

- Help runners pre-recon the course visually at the points where wrong turns are most plausible.
- Make turn direction unambiguous on every photo by overlaying a directional chevron, regardless of which way the camera happens to be aimed.
- Match the Tinman visual identity (Oswald headings, yellow `--primary`, white `--bg-card`, black accent).
- Add no new map dependencies, no new shared modules, no API keys.

## Non-Goals

- Not building a 3D AR overlay or perspective-projected arrow on the road surface.
- Not animating arrows or auto-cycling photos.
- Not adding Street View for every one of the 38 turn-by-turn steps — only the 9 curated locations the user vetted (3 of the original 12 had no Google Street View imagery).
- Not changing any other map's Street View behavior. Wild-goose stays as-is.

## User Experience

1. The map loads with three toggle buttons in the standard order: **Aid Stations · Street View · 3D**. All three default to inactive (hidden).
2. Tapping **Street View** activates the button (yellow background) and reveals 9 numbered markers along the course.
3. The markers are visually distinct from aid stations: a black circle with a yellow border and a white camera glyph (rather than a yellow circle with a `+`).
4. Tapping a marker opens a popup ~360px wide:
   - **Top pill:** turn instruction in bold (Oswald), mile in muted secondary text. Example: *"Turn right onto Boyer Avenue · Mile 0.03"*.
   - **Photo:** 640×360 Street View thumbnail at the captured pano + yaw + pitch.
   - **Arrow chevron:** brand-yellow SVG, ~80px, positioned bottom-center, rotated by the computed `arrowAngle` so it points toward where the runner heads from this vantage. Drop shadow for legibility against varied photo backgrounds.
   - **Footer link:** *"Open in Google Maps →"* deep-links into Street View at the captured pano with the same yaw/pitch.
5. Tapping the **Street View** toggle again hides all markers and closes any open popup.

## Visual Design

### Popup layout
```
┌─ popup, 360px wide, var(--radius) corners, bg var(--paper) ─┐
│ Turn right onto Boyer Avenue                                │  ← .streetview-title (Roboto Slab 600, --ink)
│ MILE 0.03                                                   │  ← .streetview-meta (JetBrains Mono 500, raceInk @ 60%)
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           [Street View thumbnail 360×200]                   │
│                                                             │
│                      ↱                                      │  ← .streetview-arrow, rotate(arrowAngle)
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Open in Google Maps →                                       │  ← .streetview-link (Source Serif 4, --ink)
└─────────────────────────────────────────────────────────────┘
```

### Map marker
- 28×28 SVG inside a 32×32 div for tap area.
- `palette.raceInk` (#1a1a1a) fill, `palette.raceBrand` (#F5C518) yellow 2px stroke.
- Centered white camera glyph (Heroicons "camera" outline, 14×14).
- No number on the marker — the popup carries identity. (Wild-goose used numbers to disambiguate similar-looking trail-corridor turns; Tupper Lake Tinman's marker positions are visually distinct on a road map, so a generic camera icon is cleaner.)
- Hidden via `element.style.display = 'none'` when toggle is off; not by removing from the map (preserves coupling with the marker's popup state). Mirrors the `aidMarkers + toggleAid()` pattern at `override.js:62, 1437`.

### Arrow chevron
- SVG path roughly: `M 8 24 L 24 8 L 40 24 M 24 8 L 24 40` — a chevron over a stem, drawn in a 48×48 viewBox.
- Final element is 80px square, positioned `absolute; bottom: 16px; left: 50%; transform-origin: 50% 50%; transform: translate(-50%, 0) rotate({arrowAngle}deg);`
- Fill: **`#F5C518` hardcoded** (matches `tinmanTheme.palette.raceBrand`). Stroke: `#1a1a1a` 2px. Drop shadow: `filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45))`.
- *Why hardcode and not use a CSS variable?* The current `cssVars` block in `config.js` reads `tinmanTheme.palette.accent`, but `RacePalette` in `src/themes/race-theme.ts` does not define an `accent` field — so `--primary`, `--accent`, and `--tinman-color` currently emit as `undefined` and are rejected by the browser. Using a hardcoded value keeps Street View visually correct independent of that pre-existing token bug. (See "Pre-existing issues observed" below.)
- The 0° "default" orientation points up (forward into the photo). Positive rotation = clockwise (toward the right side of the frame), per CSS convention.

### CSS variables used
The new editorial token vocabulary (defined in `tupper-lake-tinman/config.js > cssVars`) is sufficient: `--paper` (popup background), `--ink` (title text), `--font-display` / `--font-body` / `--font-micro` (typography), `--radius`. The popup deliberately does **not** depend on `--primary` / `--accent` / `--tinman-color` (see chevron note above).

No new tokens introduced.

## Architecture

### Files to create
- `src/maps/tupper-lake-tinman/data/streetview.json` — array of 9 turn objects.
- `tests/tinman-streetview.test.js` — Vitest unit tests for arrow-rotation math.

### Files to modify
- `src/maps/tupper-lake-tinman/config.js`:
  - `loadJSON('data/streetview.json')` and inline as `var STREETVIEW_TURNS = ${...}` inside `configDataJs`.
  - Add the toggle button to `mapViewHtml > .map-btns`, between `aidBtn` and `terrainBtn`: `<button class="trail-btn" id="streetviewBtn" onclick="toggleStreetview()">Street View</button>`.
- `src/maps/tupper-lake-tinman/override.js`:
  - Add a `streetviewMarkers = []` module-level array and a `streetviewVisible = false` state flag (alongside `aidMarkers` / `aidOn` near line 62).
  - Inside the existing `map.on('load')` body, after the aid-station block (~line 625), iterate `STREETVIEW_TURNS`: create a `<div class="streetview-marker">` element with the camera-icon SVG (display: none initially), build the popup HTML (title pill + photo wrap with the rotated chevron + Maps link), attach a `maplibregl.Popup` with `className: 'streetview-popup', maxWidth: '380px'`, and push the result into `streetviewMarkers`.
  - Add a `toggleStreetview()` global function (alongside `toggleAid` near line 1437) that toggles the state, the button's `.active` class, and each marker element's `display`.
  - Extend the existing tap-passthrough guard at line 570 (`closest('.aid-marker, .hq-marker, .mile-marker')`) to also include `.streetview-marker` so a tap on a marker doesn't fall through to the course click handler.
  - Export the rotation helpers (`normalizeAngle`, `streetviewArrowAngle`) via the `module.exports` test-guard pattern already used elsewhere in this file (Vitest will require the module).
- `src/maps/tupper-lake-tinman/override.css`:
  - Add `.streetview-marker`, `.streetview-popup`, `.streetview-photo-wrap`, `.streetview-photo`, `.streetview-arrow`, `.streetview-title`, `.streetview-meta`, `.streetview-link` rules.
- `tests/tupper-lake-tinman.e2e.js`:
  - Extend with Street View specs (toggle visibility, popup contents, chevron `transform: rotate(...)`). Adding to the existing tinman e2e file rather than creating a new one keeps Playwright cold-start cost down — that file already opens the map page.

### Files NOT touched
- `build.js` — no changes; the existing `loadJSON` + config-data inlining handles the new file automatically because it's referenced from `config.js`.
- `src/shared/*` — no changes; Street View is map-local, not a shared module.
- `src/themes/tupper-lake-tinman.js` and `src/themes/race-theme.ts` — no changes. The existing `palette.raceBrand` value (#F5C518) is read indirectly by hardcoding it in override.css rather than threading a new token through the theme contract.
- `src/templates/*` — no changes; the toggle button lives inside `mapViewHtml` in the per-map config, which is what `race-shell.html` interpolates.
- `src/shared/editorial-runtime.js` — no changes. This script reparents the profile section into the editorial "essentials block" at runtime; Street View markers and popups live on the map and aren't affected.
- Any other map (escarpment, wild-goose, etc.).

## Data Model

`src/maps/tupper-lake-tinman/data/streetview.json` is a flat array. Each entry has every field the popup, the marker, and the arrow-rotation math need. We store `bearingAfter` directly rather than recomputing it at runtime — the steps file is the source of truth, but copying it into this file keeps Street View self-contained and avoids a runtime join across two arrays.

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

The popup `coords` field is the pin location on the map. It's set to the **intersection coordinate** from `tinman-steps.json` (where the navigation decision happens), not the camera position from the Street View URL — those can differ by a few meters if Google snapped the pano to a nearby curb. We want the marker on the corner.

## Arrow Rotation Math

A small helper, exported for testability:

```javascript
// Normalize any angle in degrees to [-180, 180]
function normalizeAngle(deg) {
  var x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

// Returns the chevron's CSS rotation (degrees) for a given turn.
// 0° = arrow points "up" into the photo (runner continues along camera direction).
// Positive = clockwise (exit is to the right of the frame).
function streetviewArrowAngle(turn) {
  return normalizeAngle(turn.bearingAfter - turn.yaw);
}
```

**Edge cases:**
- `bearingAfter` and `yaw` are bearings in degrees (0–360, north = 0). Both are floats from real captured data.
- `normalizeAngle(0)` → `0`; `normalizeAngle(361)` → `1`; `normalizeAngle(-540)` → `-180` (we accept either −180 or +180 at the discontinuity — they render identically).
- All 9 captured photos have `|arrowAngle| ≤ 90°`, so the chevron always points into the visible frame. If a future photo is captured with the exit behind the camera, the arrow will simply rotate beyond 90° and visibly cross the photo edge — acceptable degraded rendering, the text label still disambiguates.

### Computed arrow angles for the 9 photos

| Mile | Turn | yaw | bearingAfter | arrowAngle |
|------|------|-----|--------------|------------|
| 0.03 | Boyer Ave | 116.16 | 171 | +54.84° |
| 0.42 | East Park St | 137.24 | 82 | −55.24° |
| 2.15 | Old Wawbeek / Dugal | 98.82 | 119 | +20.18° |
| 4.44 | Pleasant Ave | 334.81 | 262 | −72.81° |
| 4.62 | Chemical St | 265.99 | 201 | −64.99° |
| 5.02 | McLaughlin Ave | 14.53 | 285 | −89.53° |
| 6.67 | Main St | 260.01 | 327 | +66.99° |
| 8.29 | Wolf Pond Rd | 331.20 | 330 | −1.20° |
| 9.32 | Fuller Ave | 255.91 | 180 | −75.91° |

## Toggle Behavior

- **Default:** hidden (toggle button inactive).
- **State:** module-scoped `streetviewVisible` boolean inside `override.js`.
- **Implementation:** identical pattern to `toggleAid()` already in `override.js` — flip the boolean, toggle the button's `.active` class, iterate the marker list adding/removing from the map.
- **Marker-popup coupling:** add the popup to the marker at construction time (so the marker carries the popup with it on `addTo`/`remove`).

## Embed Compatibility

The Tupper Lake Tinman map sets `skipSharedJs: true`. `build.js` already injects `embed-modal.js` separately for skip-shared-js maps; `override.js` is concatenated for both the full and embed builds. The new Street View code lives entirely inside `override.js`, so it's automatically present in `dist/embed/tupper-lake-tinman/index.html` with no build-script changes.

The toggle button is in `mapViewHtml`, which is shared between full and embed shells, so no extra wiring needed there either.

**Verification step (during implementation):** open the built embed (`dist/embed/tupper-lake-tinman/index.html`) and confirm the toggle, markers, and popup all work.

## Testing

### Unit (Vitest)
`tests/tinman-streetview.test.js`:
- `normalizeAngle(0) === 0`
- `normalizeAngle(180) === 180` (or `-180` — accept either)
- `normalizeAngle(-180) === -180` (or `180`)
- `normalizeAngle(360) === 0`
- `normalizeAngle(450) === 90`
- `normalizeAngle(-450) === -90`
- `streetviewArrowAngle({ yaw: 116.16, bearingAfter: 171 })` ≈ `54.84` (within 0.01)
- `streetviewArrowAngle({ yaw: 137.24, bearingAfter: 82 })` ≈ `-55.24`

The helper is small enough to live inline in `override.js` and be re-exported via a `module.exports` guard for tests, mirroring how shared coord helpers are tested today.

### E2E (Playwright)
Extend `tests/tupper-lake-tinman.e2e.js` with a new `test.describe('Street View')` block:
- Navigate to `/maps/tupper-lake-tinman/`.
- Assert the **Street View** button exists in the `.map-btns` row, in position 2 (between Aid Stations and 3D).
- Assert no `.streetview-marker` is visible initially.
- Click the button; assert it gains `.active` and 9 markers become visible.
- Click the first marker; assert a `.streetview-popup` appears with:
  - `.streetview-title` text containing "Boyer"
  - `.streetview-photo` `src` containing `panoid=H3Z_ClxiBAJECBtSj3-Yig`
  - `.streetview-arrow` element exists, with a `transform: rotate(...)` style applied (assert non-empty rotate, not the exact angle — that's the unit test's job).
- Click the button again; assert popup closes and markers hide.

### Build/lint
- `node build.js` must succeed.
- `npx vitest run` must pass.
- `npx playwright test` must pass.

## Pre-existing Issues Observed

While re-reading the post-merge codebase, I noticed one pre-existing bug. **It is not in scope for this spec to fix** — flagged for awareness so the implementation makes a sensible local choice and so it can be triaged separately.

- `src/maps/tupper-lake-tinman/config.js` references `tinmanTheme.palette.accent` for `--accent`, `--primary`, `--tinman-color`, and `--popup-bg` (the `--popup-bg` line uses `paper`, but the others use `accent`). `RacePalette` in `src/themes/race-theme.ts` does not define an `accent` key, so those tokens are emitted as the literal string `"undefined"` and the browser drops the declarations. Affects any consumer of `var(--primary)` / `var(--accent)` / `var(--tinman-color)` without a fallback. This spec sidesteps the issue by hardcoding chevron color to `#F5C518` (matching `palette.raceBrand`) so Street View renders correctly regardless. A follow-up cleanup — either renaming `accent` references to `raceBrand` or adding `accent: '#F5C518'` to the theme palette — is a separate ticket.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Google's `streetviewpixels-pa.googleapis.com` thumbnail endpoint is undocumented and could change. | Already in production use on wild-goose; we accept the same dependency. If it breaks, the popup degrades to a missing-image icon plus the text caption + Google Maps link. |
| A pano gets removed or the imagery is updated and the captured yaw/pitch points somewhere unhelpful. | Yaw/pitch are advisory parameters — Google still serves *something* at the pano. Annual review during race-season prep. |
| Loading 9 thumbnails on popup-open feels slow on mobile data. | Thumbnails fetch lazily — only when the user clicks a marker. We do not preload. |
| Photo content is sensitive (private property visible in shot). | Race directors should review each photo before launch. Captions and the link to Google Maps already imply Google ownership. |

## Out of Scope / Future

- Adding the 3 missing locations (run start, Olympic turnaround, final U-turn) once Google captures imagery there. Backlog only.
- Two-arrow "approach + exit" overlay (Option B from brainstorm). Reconsider if user feedback flags ambiguity at any specific intersection.
- Sharing the `TURNS` schema with other maps via a shared module. Premature — only 2 maps use this pattern (wild-goose, tinman) and their popup styling is intentionally different.
- A "play mode" that auto-cycles through Street View photos in race order.

## Open Questions

None — all earlier decisions confirmed by user:
- Tier 1 + Tier 2 photo set (12 → 9 after no-imagery skips). ✓
- Option A (single forward chevron) approach. ✓
- "Street View" toggle label. ✓
- Toggle order: Aid Stations · Street View · 3D. ✓
- Hidden by default. ✓
- Caption #4 as "Old Wawbeek / Dugal Loop Entry · Mile 2.15." ✓
