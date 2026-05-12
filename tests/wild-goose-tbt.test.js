// wild-goose-tbt.test.js — unit-level contract for the turn-by-turn
// data layer. Three checks:
//
//   1. Per-loop turns.geojson on disk has the schema the build expects
//      (FeatureCollection of Points, each carrying the seven properties
//      override.js reads).
//   2. Turn miles are monotonic and inside the loop's documented mileage.
//   3. The built HTML inlines LOOP_TURNS with all three loops populated,
//      and exposes the runtime helpers (setActiveTurnByRow, setZoomToStep,
//      renderInterleavedList) by name.
//
// We can't import override.js's inline helpers directly, so the snap
// logic is verified at the integration layer (playwright e2e).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const dataDir = resolve(__dirname, '../src/maps/wild-goose/data');
const builtHtml = resolve(__dirname, '../dist/maps/wild-goose/index.html');

function loadTurns(loopId) {
  const file = resolve(dataDir, `${loopId}-turns.geojson`);
  expect(existsSync(file), `${loopId}-turns.geojson must exist`).toBe(true);
  return JSON.parse(readFileSync(file, 'utf8'));
}

const LOOP_BOUNDS = {
  pink:      { minTurns: 8,  maxTurns: 40, miles: 7.75 },
  blue:      { minTurns: 5,  maxTurns: 25, miles: 6.0  },
  checkered: { minTurns: 6,  maxTurns: 30, miles: 4.75 },
};

describe('Wild Goose per-loop turns.geojson', () => {
  for (const loopId of Object.keys(LOOP_BOUNDS)) {
    const bounds = LOOP_BOUNDS[loopId];

    it(`${loopId}: FeatureCollection of Points with required props`, () => {
      const fc = loadTurns(loopId);
      expect(fc.type).toBe('FeatureCollection');
      expect(Array.isArray(fc.features)).toBe(true);
      expect(fc.features.length).toBeGreaterThanOrEqual(bounds.minTurns);
      expect(fc.features.length).toBeLessThanOrEqual(bounds.maxTurns);
      for (const f of fc.features) {
        expect(f.type).toBe('Feature');
        expect(f.geometry.type).toBe('Point');
        expect(Array.isArray(f.geometry.coordinates)).toBe(true);
        expect(f.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
        const p = f.properties;
        expect(typeof p.course_mi).toBe('number');
        expect(['left', 'right', 'straight']).toContain(p.direction);
        expect(['sharp', 'normal', 'slight', 'fork']).toContain(p.intensity);
        // label may be empty when OSM enrichment finds nothing, but the
        // key must exist (the JS expects to read .properties.label).
        expect('label' in p).toBe(true);
      }
    });

    it(`${loopId}: turn miles are monotonically increasing and within the loop length`, () => {
      const fc = loadTurns(loopId);
      let prev = -Infinity;
      for (const f of fc.features) {
        expect(f.properties.course_mi).toBeGreaterThanOrEqual(prev);
        prev = f.properties.course_mi;
        // Each turn must sit on the course — bounded above by the
        // published loop mileage (with a small slack for snap drift).
        expect(f.properties.course_mi).toBeLessThanOrEqual(bounds.miles + 0.5);
      }
    });

    it(`${loopId}: every turn lat/lng falls inside Wawayanda State Park bbox`, () => {
      // Coarse bbox around Wawayanda State Park (where Wild Goose runs).
      // Guards against the pipeline producing a turn from a wrong GPX or
      // a coordinate-mirror bug (lat/lng swapped).
      const fc = loadTurns(loopId);
      for (const f of fc.features) {
        const [lng, lat] = f.geometry.coordinates;
        expect(lng).toBeGreaterThan(-74.5);
        expect(lng).toBeLessThan(-74.3);
        expect(lat).toBeGreaterThan(41.10);
        expect(lat).toBeLessThan(41.25);
      }
    });
  }
});

describe('Wild Goose built HTML inlines turn-by-turn', () => {
  function readBuilt() {
    expect(existsSync(builtHtml), 'run `node build.js` before this test').toBe(true);
    return readFileSync(builtHtml, 'utf8');
  }

  it('LOOP_TURNS is defined with all three loop arrays', () => {
    const html = readBuilt();
    expect(html).toMatch(/var LOOP_TURNS\s*=\s*\{/);
    expect(html).toMatch(/pink:\s*\[/);
    expect(html).toMatch(/blue:\s*\[/);
    expect(html).toMatch(/checkered:\s*\[/);
  });

  it('runtime helpers are inlined by name', () => {
    const html = readBuilt();
    // Function declarations override.js depends on for the interaction.
    expect(html).toContain('function renderInterleavedList');
    expect(html).toContain('function setActiveTurnByRow');
    expect(html).toContain('function setZoomToStep');
    expect(html).toContain('SNAPPED_TURN_MILES');
  });

  it('active-segment source + layer are wired up', () => {
    const html = readBuilt();
    expect(html).toContain("'dir-active-segment'");
    expect(html).toContain("'dir-active-segment-halo'");
    expect(html).toContain("'dir-active-segment-line'");
  });

  it('zoom-to-step persists via wildGoose.zoomToStep localStorage key', () => {
    const html = readBuilt();
    expect(html).toContain("'wildGoose.zoomToStep'");
  });
});
