import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const distPath = resolve(__dirname, '../dist/maps/tupper-lake-tinman/index.html');
const embedPath = resolve(__dirname, '../dist/embed/tupper-lake-tinman/index.html');
const dataDir = resolve(__dirname, '../src/maps/tupper-lake-tinman/data');

const html = readFileSync(distPath, 'utf-8');
const embedHtml = readFileSync(embedPath, 'utf-8');

describe('Tinman build artifacts', () => {
  it('builds main index.html', () => {
    expect(html.length).toBeGreaterThan(50_000);
  });

  it('builds embed index.html', () => {
    expect(embedHtml.length).toBeGreaterThan(50_000);
  });

  it('has all three race GeoJSON + profile files', () => {
    ['sprint', 'olympic', 'tinman'].forEach((slug) => {
      expect(existsSync(join(dataDir, `${slug}.geojson`))).toBe(true);
      expect(existsSync(join(dataDir, `${slug}-profile.json`))).toBe(true);
    });
  });

  it('has aid-stations.json', () => {
    const aid = JSON.parse(readFileSync(join(dataDir, 'aid-stations.json'), 'utf-8'));
    expect(Array.isArray(aid)).toBe(true);
    expect(aid.length).toBeGreaterThanOrEqual(7);
    aid.forEach((s) => {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('miles');
      expect(s).toHaveProperty('lng');
      expect(s).toHaveProperty('lat');
      expect(Array.isArray(s.miles)).toBe(true);
    });
  });
});

describe('Tinman branding and content', () => {
  it('uses race name in title and masthead', () => {
    expect(html).toContain('Tupper Lake Tinman');
    expect(html).toContain('June 27, 2026');
    // 44th running is now authoritative in the course-strip cell, not the masthead.
    expect(html).toContain('44th running');
  });

  it('links to race website', () => {
    expect(html).toContain('href="https://www.tupperlaketinman.com/"');
  });

  it('uses paper substrate tokens, not pure-white SaaS chrome', () => {
    expect(html).toContain('--paper: #ece4d3');
    expect(html).toContain('--ink: #1a1c1c');
    expect(html).toContain('--accent: #9b3a2e');
    expect(html).not.toMatch(/--bg:\s*#ffffff/);
    expect(html).not.toMatch(/--bg-card:\s*#ffffff/);
  });

  it('uses dark course line', () => {
    expect(html).toContain('--course: #111111');
  });

  it('imports the editorial type stack (Fraunces / Spectral / JetBrains Mono)', () => {
    expect(html).toContain('Fraunces');
    expect(html).toContain('Spectral');
    expect(html).toContain('JetBrains+Mono');
  });

  it('does not import any forbidden fonts', () => {
    // System Inter / Roboto / Arial / Space Grotesk / Poppins are explicitly
    // banned by the design brief. They must not appear as font-face requests.
    expect(html).not.toMatch(/family=Inter[:&]/);
    expect(html).not.toMatch(/family=Roboto[:&]/);
    expect(html).not.toMatch(/family=Space\+Grotesk[:&]/);
    expect(html).not.toMatch(/family=Poppins[:&]/);
    expect(html).not.toMatch(/family=Oswald[:&]/);
  });

  it('includes Tinman/Olympic/Sprint loops in LOOPS object', () => {
    expect(html).toContain('var LOOPS');
    expect(html).toMatch(/sprint:\s*\{[^}]*color:\s*'#F5C518'/);
    expect(html).toMatch(/olympic:\s*\{[^}]*color:\s*'#2E7D32'/);
    expect(html).toMatch(/tinman:\s*\{[^}]*color:\s*'#C8102E'/);
  });

  it('includes RACES object with three distances', () => {
    expect(html).toContain("var RACES");
    expect(html).toMatch(/sprint:\s*\{\s*name:\s*'Sprint'/);
    expect(html).toMatch(/olympic:\s*\{\s*name:\s*'Olympic'/);
    expect(html).toMatch(/tinman:\s*\{\s*name:\s*'Tinman'/);
  });

  it('inlines aid stations with mile markers', () => {
    expect(html).toContain('AID_STATIONS');
    expect(html).toContain('History Museum');
    expect(html).toContain('Civic Center');
    expect(html).toContain('Train Station');
    expect(html).toContain('Little Wolf');
  });

  it('uses BIKE FINISH / RUN START label (T2), not swim start', () => {
    expect(html).toContain('BIKE FINISH / RUN START');
    expect(html).toContain('Bike Finish / Run Start (T2)');
    expect(html).not.toContain('SWIM START / FINISH');
    expect(html).not.toContain('Swim Start / Run Finish');
  });
});

describe('Tinman directional arrows + turn-by-turn', () => {
  it('removed the old symbol-layer arrows (replaced by parallel-offset rendering)', () => {
    expect(html).not.toContain('registerArrowIcons');
    expect(html).not.toContain("'arrow-' + id");
    expect(html).not.toMatch(/id:\s*id\s*\+\s*'-arrows'/);
  });

  it('renders out segments with positive line-offset and back with negative', () => {
    // Offsets live in shared `outOffset` / `backOffset` variables defined just
    // above the layer block.
    expect(html).toMatch(/var\s+outOffset\s*=\s*\[[^;]*17,\s*7\s*\]/);
    expect(html).toMatch(/var\s+backOffset\s*=\s*\[[^;]*17,\s*-7\s*\]/);

    const outIdx = html.indexOf("id: id + '-out',");
    const outBlock = html.substr(outIdx, 600);
    expect(outBlock).toContain("['==', ['get', 'phase'], 'out']");
    expect(outBlock).toContain("'line-offset': outOffset");

    const backIdx = html.indexOf("id: id + '-back',");
    const backBlock = html.substr(backIdx, 600);
    expect(backBlock).toContain("['==', ['get', 'phase'], 'back']");
    expect(backBlock).toContain("'line-offset': backOffset");
    expect(backBlock).toContain("'line-dasharray': [3, 1.8]");
  });

  it('renders the OUT/RETURN/Turnaround legend overlay', () => {
    expect(html).toContain('class="course-legend"');
    expect(html).toContain('Outbound');
    expect(html).toContain('Return');
    expect(html).toContain('Turnaround');
  });

  it('inlines TURNAROUNDS data and creates loop-scoped turnaround markers', () => {
    expect(html).toContain('var TURNAROUNDS');
    expect(html).toContain('loopTurnMarkers');
    expect(html).toContain('turnaround-marker');
  });

  it('phase-split GeoJSON has features tagged out or back', () => {
    for (const slug of ['sprint', 'olympic', 'tinman']) {
      const geo = JSON.parse(readFileSync(resolve(__dirname, `../src/maps/tupper-lake-tinman/data/${slug}.geojson`), 'utf-8'));
      expect(geo.features.length, `${slug} should have multiple phase segments`).toBeGreaterThan(1);
      const phases = new Set(geo.features.map(f => f.properties.phase));
      expect(phases.has('out')).toBe(true);
      expect(phases.has('back')).toBe(true);
    }
  });

  it('emits a turnarounds JSON file with at least one entry per race', () => {
    const expected = { sprint: 1, olympic: 1, tinman: 2 };
    for (const slug of ['sprint', 'olympic', 'tinman']) {
      const turns = JSON.parse(readFileSync(resolve(__dirname, `../src/maps/tupper-lake-tinman/data/${slug}-turnarounds.json`), 'utf-8'));
      expect(turns.length, `${slug} should have ~${expected[slug]} turnaround(s)`).toBeGreaterThanOrEqual(expected[slug]);
      for (const t of turns) {
        expect(t).toHaveProperty('lng');
        expect(t).toHaveProperty('lat');
        expect(t).toHaveProperty('mile');
      }
    }
  });

  it('inlines a DIRECTIONS object with per-race step lists', () => {
    expect(html).toContain('var DIRECTIONS');
    expect(html).toMatch(/sprint:\s*\[/);
    expect(html).toMatch(/olympic:\s*\[/);
    expect(html).toMatch(/tinman:\s*\[/);
  });

  it('renders the turn-by-turn UI section in the map view', () => {
    expect(html).toContain('id="directionsSection"');
    expect(html).toContain('id="directionsList"');
    expect(html).toContain('id="directionsRaceLabel"');
    expect(html).toContain('Turn-by-Turn');
  });

  it('renderDirections is called when a race is selected', () => {
    expect(html).toContain('renderDirections(raceId)');
    expect(html).toContain("renderDirections('tinman')"); // initial render
  });

  it('step JSON files match the expected schema', () => {
    for (const slug of ['sprint', 'olympic', 'tinman']) {
      const steps = JSON.parse(readFileSync(resolve(__dirname, `../src/maps/tupper-lake-tinman/data/${slug}-steps.json`), 'utf-8'));
      expect(steps.length, `${slug} should have at least 3 steps`).toBeGreaterThan(2);
      for (const s of steps) {
        expect(s).toHaveProperty('n');
        expect(s).toHaveProperty('instruction');
        expect(s).toHaveProperty('mile');
        expect(s).toHaveProperty('distMi');
      }
    }
  });

  it('step miles are monotonic (cumulative across the run)', () => {
    for (const slug of ['sprint', 'olympic', 'tinman']) {
      const steps = JSON.parse(readFileSync(resolve(__dirname, `../src/maps/tupper-lake-tinman/data/${slug}-steps.json`), 'utf-8'));
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].mile, `${slug} step ${i + 1} (${steps[i].instruction}) mile must be >= prior`).toBeGreaterThanOrEqual(steps[i - 1].mile);
      }
    }
  });

  it('every race ends with an arrive maneuver at total miles', () => {
    const expectedMiles = { sprint: 3.1, olympic: 6.2, tinman: 13.1 };
    for (const slug of ['sprint', 'olympic', 'tinman']) {
      const steps = JSON.parse(readFileSync(resolve(__dirname, `../src/maps/tupper-lake-tinman/data/${slug}-steps.json`), 'utf-8'));
      const last = steps[steps.length - 1];
      expect(last.type, `${slug} last step type`).toBe('arrive');
      expect(Math.abs(last.mile - expectedMiles[slug])).toBeLessThan(0.05);
    }
  });
});

describe('Tinman course geometry (road-snapped)', () => {
  it('uses official course distances (3.1 / 6.2 / 13.1 mi)', () => {
    expect(html).toMatch(/sprint:\s*\{[^}]*miles:\s*3\.1\b/);
    expect(html).toMatch(/olympic:\s*\{[^}]*miles:\s*6\.2\b/);
    expect(html).toMatch(/tinman:\s*\{[^}]*miles:\s*13\.1\b/);
  });

  it('aid station mileage matches published values within 0.2 mi tolerance', () => {
    const aid = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/tupper-lake-tinman/data/aid-stations.json'), 'utf-8'));
    const byName = Object.fromEntries(aid.map(a => [a.name, a.miles]));
    // Published values from tupperlaketinman.com
    const expected = {
      'Tupper Lake History Museum': [1.25, 5.1],
      'Sunmount': [2.1, 4.3],
      'Dugal Rd turnaround': [3.2],
      'Tupper Lake Civic Center': [6.15, 12.1],
      'Train Station': [7.2, 11.2],
      'N Little Wolf Turnaround': [9.1],
      'S Little Wolf': [10.25],
    };
    for (const [name, expectedMiles] of Object.entries(expected)) {
      const actualMiles = byName[name];
      expect(actualMiles, `aid station ${name} missing`).toBeDefined();
      expect(actualMiles.length).toBe(expectedMiles.length);
      expectedMiles.forEach((em, i) => {
        expect(Math.abs(actualMiles[i] - em), `${name} pass ${i + 1}: expected ~${em}, got ${actualMiles[i]}`).toBeLessThan(0.25);
      });
    }
  });

  it('snapped course coordinates are dense enough to follow roads (sum across phase segments)', () => {
    const tinmanGeo = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/tupper-lake-tinman/data/tinman.geojson'), 'utf-8'));
    const total = tinmanGeo.features.reduce((s, f) => s + f.geometry.coordinates.length, 0);
    expect(total).toBeGreaterThan(150);
  });
});

describe('Tinman map features', () => {
  it('hides conflicting basemap path layers on load', () => {
    expect(html).toContain('roads_other');
    expect(html).toContain('roads_labels_minor');
    expect(html).toMatch(/setLayoutProperty\(['"]?id['"]?,\s*['"]visibility['"],\s*['"]none['"]/);
  });

  it('renders mile markers as circle + symbol layers', () => {
    expect(html).toContain("-miles-circle");
    expect(html).toContain("-miles-label");
  });

  it('mile marker text size scales up to zoom 17', () => {
    expect(html).toMatch(/text-size'.*?17,\s*14/);
  });

  it('mile marker circle radius scales up to zoom 17', () => {
    expect(html).toMatch(/circle-radius'.*?17,\s*11/);
  });

  it('aid station toggle exists', () => {
    expect(html).toContain('toggleAid');
    expect(html).toContain('aidBtn');
    expect(html).toContain('Aid Stations');
  });

  it('3D terrain toggle exists', () => {
    expect(html).toContain('toggle3D');
    expect(html).toContain('terrainBtn');
  });

  it('uses dark casing + dark inner backbone for low-zoom visibility', () => {
    expect(html).toMatch(/-casing[\s\S]{0,300}'line-color':\s*'#000'/);
    expect(html).toMatch(/-dark[\s\S]{0,300}'line-color':\s*'#111'/);
  });

  it('renders rotated turn-direction chevrons (depart + every navigable turn)', () => {
    expect(html).toContain('registerTurnIcons');
    expect(html).toContain('addTurnArrowLayers');
    expect(html).toContain('buildTurnArrowSource');
    // Two layers per loop — major decisions (default zoom) + minor turns
    expect(html).toContain("'-turn-badges'");
    expect(html).toContain("'-turn-badges-minor'");
    // Chevron rotates per feature based on the OSRM bearing_after value
    expect(html).toContain("'icon-rotate': ['get', 'bearing']");
    expect(html).toContain("'icon-rotation-alignment': 'map'");
  });

  it('directions data includes bearings so the depart arrow can render', () => {
    const t = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/tupper-lake-tinman/data/tinman-steps.json'), 'utf-8'));
    const depart = t.find(s => s.type === 'depart');
    expect(depart, 'expected at least one depart maneuver').toBeDefined();
    expect(typeof depart.bearingAfter).toBe('number');
    // Every non-arrive step has a bearing-after that the symbol layer can use.
    const navigables = t.filter(s => s.type !== 'arrive' && s.location);
    for (const s of navigables) expect(typeof s.bearingAfter).toBe('number');
  });

  it('defaults to only the Tinman loop visible (Sprint + Olympic hidden)', () => {
    expect(html).toMatch(/sprint:\s*\{[^}]*visible:\s*false/);
    expect(html).toMatch(/olympic:\s*\{[^}]*visible:\s*false/);
    expect(html).toMatch(/tinman:\s*\{[^}]*visible:\s*true/);
  });

  it('Tinman has multiple turnaround markers including a mid-course U-turn', () => {
    const t = JSON.parse(readFileSync(resolve(__dirname, '../src/maps/tupper-lake-tinman/data/tinman-turnarounds.json'), 'utf-8'));
    expect(t.length).toBeGreaterThanOrEqual(3);
    const miles = t.map(x => x.mile);
    // Major turnarounds (Dugal, N. Little Wolf) plus at least one mid-course
    // U-turn between miles 4 and 8.
    expect(miles.some(m => m >= 4 && m <= 8), 'expected a mid-course U-turn marker').toBe(true);
  });

  it('does not contain checkered loop pattern (carryover from wild-goose)', () => {
    expect(html).not.toContain('checkered-dot');
    expect(html).not.toContain('repeating-conic-gradient(#000 0% 25%');
  });

  it('does not contain wild-goose turn markers', () => {
    expect(html).not.toContain('TURNS = [');
    expect(html).not.toContain('streetviewpixels-pa');
  });
});

describe('Tinman simulator', () => {
  it('initializes simulator with Tinman as default race', () => {
    expect(html).toMatch(/simRace\s*=\s*RACES\['tinman'\]/);
  });

  it('builds race buttons for all three distances', () => {
    expect(html).toContain('buildSimRaces');
    expect(html).toContain("['sprint', 'olympic', 'tinman']");
  });

  it('renders course map with mile markers and aid station dots', () => {
    expect(html).toContain('renderCourseMap');
    expect(html).toContain("loopId === 'tinman'");
  });
});

describe('Tinman interactive directions', () => {
  it('renders the Click vs Scrub mode toggle in the directions header', () => {
    expect(html).toContain('class="dir-mode-toggle"');
    expect(html).toContain('data-mode="click"');
    expect(html).toContain('data-mode="scrub"');
    expect(html).toContain("setDirMode('click')");
    expect(html).toContain("setDirMode('scrub')");
  });

  it('header is a div wrapper (not button-in-button) with a separate toggle button', () => {
    // The old <button class="directions-header"> would have nested buttons inside,
    // which is invalid HTML. The new structure wraps in a div and isolates the
    // collapse-toggle button as `.directions-toggle`.
    expect(html).toContain('class="directions-header"');
    expect(html).toContain('class="directions-toggle"');
    expect(html).not.toMatch(/<button[^>]*class="directions-header"/);
  });

  it('emits clickable list items with data-step-idx attributes', () => {
    expect(html).toContain('data-step-idx="');
    expect(html).toContain("'<li class=\"dir-step\" data-step-idx=\"' + i + '\"");
  });

  it('declares the interactive-directions runtime symbols', () => {
    expect(html).toContain('var activeStepIdx');
    expect(html).toContain('var currentRaceId');
    expect(html).toContain('var dirMode');
    expect(html).toContain('function setActiveStep');
    expect(html).toContain('function setDirMode');
    expect(html).toContain('function stepSegmentCoords');
    expect(html).toContain('function attachScrubObserver');
    expect(html).toContain('function detachScrubObserver');
    expect(html).toContain('function setCourseDimmed');
    expect(html).toContain('function addDirectionsHighlightLayers');
  });

  it('persists the chosen mode in localStorage under tinman.dirMode', () => {
    expect(html).toContain("localStorage.getItem('tinman.dirMode')");
    expect(html).toContain("localStorage.setItem('tinman.dirMode', mode)");
  });

  it('adds highlight sources/layers (active segment + numbered active pin)', () => {
    expect(html).toContain("'dir-active-segment'");
    expect(html).toContain("'dir-active-pin'");
    expect(html).toContain("'dir-active-segment-halo'");
    expect(html).toContain("'dir-active-segment-line'");
    expect(html).toContain("'dir-active-pin-halo'");
    expect(html).toContain("'dir-active-pin-circle'");
    expect(html).toContain("'dir-active-pin-label'");
  });

  it('binds click + Enter + Arrow keys for keyboard step navigation', () => {
    expect(html).toMatch(/addEventListener\('click'/);
    expect(html).toMatch(/addEventListener\('keydown'/);
    expect(html).toContain("'ArrowDown'");
    expect(html).toContain("'ArrowUp'");
    expect(html).toContain("'ArrowRight'");
    expect(html).toContain("'ArrowLeft'");
    expect(html).toContain("e.key === 'Enter'");
  });

  it('selectRace resets activeStepIdx to -1 (then renderDirections re-anchors to 0)', () => {
    const sel = html.indexOf('function selectRace');
    expect(sel).toBeGreaterThan(0);
    const block = html.substr(sel, 1200);
    expect(block).toContain('activeStepIdx = -1');
    expect(block).toContain('detachScrubObserver()');
    expect(block).toContain('renderDirections(raceId)');
  });

  it('renderDirections resets active step to 0 every render', () => {
    const idx = html.indexOf('function renderDirections');
    expect(idx).toBeGreaterThan(0);
    const block = html.substr(idx, 5000);
    expect(block).toContain('setActiveStep(0,');
    expect(block).toContain('currentRaceId = raceId');
  });

  it('clicking a turn-arrow badge on the map activates the matching step', () => {
    expect(html).toMatch(/map\.on\('click', id \+ '-turn-badges'/);
    expect(html).toMatch(/map\.on\('click', id \+ '-turn-badges-minor'/);
    // The picker resolves the badge feature back to the closest step by mile.
    expect(html).toContain('bestDelta = Infinity');
    expect(html).toContain('setActiveStep(bestIdx');
  });

  it('Scrub mode uses IntersectionObserver scoped to the directions list', () => {
    expect(html).toContain('new IntersectionObserver');
    // root must be the list element so scrolling the list (not the page) drives
    // the observer.
    expect(html).toMatch(/root:\s*listEl/);
    // Negative bottom rootMargin is what makes the "topmost visible" step win.
    expect(html).toMatch(/rootMargin:\s*'0px 0px -70% 0px'/);
  });

  it('elevation profile draws the active-mile vertical marker', () => {
    expect(html).toContain('activeStepIdx >= 0');
    expect(html).toContain("ctx.setLineDash([3, 3])");
    expect(html).toContain("loopSeq.indexOf(RACES[currentRaceId].loops[0])");
  });

  it('CSS defines active-step styling and the mode-toggle pill', () => {
    expect(html).toContain('.dir-step.active');
    expect(html).toContain('.dir-mode-toggle');
    expect(html).toContain('.dir-mode-btn');
    expect(html).toContain('.dir-mode-btn.active');
  });

  it('respects prefers-reduced-motion for transitions and smooth scroll', () => {
    expect(html).toContain('prefers-reduced-motion: reduce');
  });
});

describe('Tinman directions–route alignment', () => {
  // Step `mile` values are emitted by OSRM against a routing graph that the
  // snapped geojson no longer matches exactly, so the runtime walks each
  // step.location forward through the route and uses the snapped mile for
  // segment highlighting, the active pin, and the displayed mileage. These
  // tests pin both the runtime hook AND the underlying data quality so the
  // highlight stays correct even if either source drifts.

  it('declares the precomputed snapped step arrays', () => {
    expect(html).toContain('SNAPPED_STEP_MILES');
    expect(html).toContain('SNAPPED_STEP_COORDS');
    expect(html).toContain('precomputeSnappedSteps');
  });

  it('stepSegmentCoords reads from SNAPPED_STEP_MILES, not the stale step.mile', () => {
    const idx = html.indexOf('function stepSegmentCoords');
    expect(idx).toBeGreaterThan(0);
    const block = html.substr(idx, 1500);
    expect(block).toContain('SNAPPED_STEP_MILES[raceId]');
  });

  it('active pin uses the snapped projection of step.location', () => {
    expect(html).toContain('SNAPPED_STEP_COORDS[currentRaceId]');
  });

  it('elevation marker uses the snapped active mile, not step.mile', () => {
    const idx = html.indexOf('Active-step marker');
    expect(idx).toBeGreaterThan(0);
    const block = html.substr(idx, 2000);
    expect(block).toContain('SNAPPED_STEP_MILES[currentRaceId]');
    expect(block).toContain('var activeMile');
  });

  it('rendered list mile column shows the snapped mile, not step.mile', () => {
    const idx = html.indexOf('function renderDirections');
    expect(idx).toBeGreaterThan(0);
    const block = html.substr(idx, 6000);
    expect(block).toContain('var displayMile = snapMiles[i]');
    expect(block).toContain("displayMile.toFixed(1)");
  });

  // Data-quality check that doubles as documentation of the alignment
  // contract: if any step.location drifts off the route by more than ~250 ft
  // the highlight will look obviously wrong on the map. 250 ft is a generous
  // ceiling — almost every Tinman step sits ON the route within a foot or
  // two; the worst real point is ~204 ft (an OSRM intersection coord that
  // sits a half-block off the snapped centerline).
  function flatten(fc) {
    const coords = [];
    for (let i = 0; i < fc.features.length; i++) {
      const c = fc.features[i].geometry.coordinates;
      const startAt = (coords.length && i > 0) ? 1 : 0;
      for (let j = startAt; j < c.length; j++) coords.push(c[j]);
    }
    return coords;
  }
  function distFtPointToSegment(p, a, b) {
    const midLat = (p[1] + a[1] + b[1]) / 3;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    const ax = a[0] * cosLat, ay = a[1];
    const bx = b[0] * cosLat, by = b[1];
    const px = p[0] * cosLat, py = p[1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    return d * 364000; // degrees → feet (lat at 1° ≈ 364,000 ft)
  }
  function offRouteFt(coords, target) {
    let best = Infinity;
    for (let i = 1; i < coords.length; i++) {
      const d = distFtPointToSegment(target, coords[i - 1], coords[i]);
      if (d < best) best = d;
    }
    return best;
  }

  it('every step.location sits within 250 ft of the snapped route', () => {
    for (const slug of ['sprint', 'olympic', 'tinman']) {
      const geo = JSON.parse(readFileSync(resolve(__dirname, `../src/maps/tupper-lake-tinman/data/${slug}.geojson`), 'utf-8'));
      const steps = JSON.parse(readFileSync(resolve(__dirname, `../src/maps/tupper-lake-tinman/data/${slug}-steps.json`), 'utf-8'));
      const coords = flatten(geo);
      for (const s of steps) {
        if (!s.location) continue;
        const off = offRouteFt(coords, s.location);
        expect(off, `${slug} step ${s.n} (${s.instruction}) is ${off.toFixed(0)} ft off the route`).toBeLessThan(250);
      }
    }
  });
});

describe('Tinman weather panel', () => {
  it('weather data is present', () => {
    expect(html).toContain('CONFIG.weather');
    expect(html).toContain('"raceDate":"2026-06-27"');
  });

  it('renders weather panel HTML when weather data present', () => {
    expect(html).toContain('weatherPanel');
    expect(html).toContain('weatherRiskCards');
    expect(html).toContain('weatherDaily');
    expect(html).toContain('weatherCurrent');
    expect(html).toContain('weatherRadar');
  });
});
