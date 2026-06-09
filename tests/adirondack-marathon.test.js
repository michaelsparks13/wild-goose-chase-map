// Smoke tests for the Adirondack Marathon & Half Marathon map.
//
// Asserts the configured artifacts (theme, geojson, profiles, weather) are
// wired up and the per-distance metadata is internally consistent. The one
// ADK-specific wrinkle vs. Pocantico Hills: the half marathon is the
// marathon's *back* half, so aid stations carry a per-loop mile
// (`mileByLoop`) offset by the difference in course lengths.
//
// Assumes `node build.js` has already run; vitest does not build.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname || __dirname, '..');
const MAP_DIR = join(ROOT, 'src', 'maps', 'adirondack-marathon');
const DATA_DIR = join(MAP_DIR, 'data');
const DIST_HTML = join(ROOT, 'dist', 'maps', 'adirondack-marathon', 'index.html');

describe('adirondack-marathon · theme + config', () => {
  it('theme exposes 2 distances each tied to a 1-loop assembly', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    expect(theme.slug).toBe('adirondack-marathon');
    expect(theme.raceFormat.discipline).toBe('road-run');
    expect(theme.raceFormat.distances).toHaveLength(2);
    for (const d of theme.raceFormat.distances) {
      expect(d.assembly).toHaveLength(1);
      expect(d.assembly[0].loopId).toBe(d.id);
      expect(typeof d.runMiles).toBe('number');
      expect(d.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('uses miles as the display unit (US race)', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    expect(theme.displayUnits).toBe('mi');
  });

  it('each distance has matching course.geojson + profile.json', () => {
    for (const id of ['marathon', 'half-marathon']) {
      expect(existsSync(join(DATA_DIR, id + '.geojson'))).toBe(true);
      expect(existsSync(join(DATA_DIR, id + '-profile.json'))).toBe(true);
    }
  });

  it('geometry is OSM-measured (~3% long); theme displays the certified distance', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    // The OSRM road centerline runs slightly long vs the USATF-certified
    // distance. We keep the measured geometry but DISPLAY certified.
    const measured = { marathon: 26.34, 'half-marathon': 13.87 };
    const certified = { marathon: 26.2, 'half-marathon': 13.1 };
    for (const d of theme.raceFormat.distances) {
      const fc = JSON.parse(readFileSync(join(DATA_DIR, d.id + '.geojson'), 'utf8'));
      const mi = fc.features[0].properties.distance_mi;
      expect(Math.abs(mi - measured[d.id])).toBeLessThan(0.6);
      expect(d.runMiles).toBe(certified[d.id]);
    }
  });

  it('TBT turn lists were generated for both loops (drives segment-highlight on click)', () => {
    for (const id of ['marathon', 'half-marathon']) {
      const p = join(DATA_DIR, id + '-turns.geojson');
      expect(existsSync(p)).toBe(true);
      const fc = JSON.parse(readFileSync(p, 'utf8'));
      expect(fc.type).toBe('FeatureCollection');
      expect(fc.features.length).toBeGreaterThanOrEqual(1);
      for (const f of fc.features) {
        expect(typeof f.properties.course_mi).toBe('number');
        expect(['left', 'right', 'straight']).toContain(f.properties.direction);
      }
    }
  });

  it('aid spine has 19 entries (start + water + 3 relay exchanges + finish) with increasing miles', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    const stns = theme.aidStations;
    expect(stns.length).toBe(19);
    for (let i = 1; i < stns.length; i++) {
      expect(stns[i].mile).toBeGreaterThan(stns[i - 1].mile);
    }
    expect(stns[0].name).toMatch(/Start/i);
    expect(stns[stns.length - 1].name).toMatch(/Finish/i);
    // Every on-course station carries GU; three are relay exchanges.
    const water = stns.filter(s => /Water/.test(s.stocked));
    expect(water.length).toBeGreaterThanOrEqual(15);
    expect(water.every(s => /GU/.test(s.stocked))).toBe(true);
    const relay = stns.filter(s => s.relay);
    expect(relay.map(s => s.mile)).toEqual([4.8, 13.1, 18.0]);
  });

  it('aid stations carry both mile and kilometer for schema parity', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    for (const s of theme.aidStations) {
      expect(typeof s.mile).toBe('number');
      expect(typeof s.kilometer).toBe('number');
      const computedMi = s.kilometer * 0.621371;
      expect(Math.abs(computedMi - s.mile)).toBeLessThan(0.5);
    }
  });

  it('marathon visits every entry; half runs the back half from the hamlet (idx 8)', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    const m = theme.raceFormat.distances.find(d => d.id === 'marathon');
    const h = theme.raceFormat.distances.find(d => d.id === 'half-marathon');
    expect(m.aidStations).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    // The half starts at the Hamlet of Adirondack (idx 8, its aidIdx[0],
    // drawn as the pennant) and visits the back-half stations + finish.
    expect(h.aidStations).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('race day is September 27, 2026 — Sunday', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    expect(theme.raceDay.date).toBe('2026-09-27');
    expect(new Date(theme.raceDay.date + 'T12:00:00').getUTCDay()).toBe(0); // Sunday
  });

  it('weather.json was generated for the September 27 race day', () => {
    const wPath = join(DATA_DIR, 'weather.json');
    expect(existsSync(wPath)).toBe(true);
    const w = JSON.parse(readFileSync(wPath, 'utf8'));
    expect(w.raceDate).toBe('2026-09-27');
    expect(w.dailyAverages.length).toBeGreaterThanOrEqual(7);
    expect(w.riskSummary.heat).toBeDefined();
    // Late September in the Adirondacks → no heat danger (cool race day).
    expect(['low', 'moderate']).toContain(w.riskSummary.heat.level);
  });

  it('typography pairs League Gothic + Mulish — both free Google Fonts', () => {
    const theme = require(join(ROOT, 'src/themes/adirondack-marathon.js'));
    expect(theme.type.display).toBe('League Gothic');
    expect(theme.type.body).toBe('Mulish');
    expect(theme.type.googleFontsHref).toContain('League+Gothic');
    expect(theme.type.googleFontsHref).toContain('Mulish');
  });
});

describe('adirondack-marathon · built HTML', () => {
  it('compiled HTML inlines both loop datasets + aid spine + default distance', () => {
    expect(existsSync(DIST_HTML)).toBe(true);
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('var marathonData');
    expect(html).toContain('var halfData');
    expect(html).toContain('AID_STATIONS_ALL');
    expect(html).toContain("var DEFAULT_DISTANCE_ID = 'marathon'");
    expect(html).toContain("var LOOP_IDS = ['marathon', 'half-marathon']");
  });

  it('has both distance picker chips with mile labels', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('data-race="marathon"');
    expect(html).toContain('data-race="half-marathon"');
    expect(html).toMatch(/26\.\d+ mi · \d+ ft/);
    expect(html).toMatch(/13\.\d+ mi · \d+ ft/);
  });

  it('aid stations carry a per-loop mile (half = marathon mile − course-length offset)', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('mileByLoop');
    // Mile-14 marathon station sits at half mile 14 − 13.1 = 0.9.
    expect(html).toContain('"half-marathon":0.9');
    // Front-half stations are not on the half route → null half mile.
    expect(html).toContain('"half-marathon":null');
  });

  it('applies the ADK navy + lake-blue palette', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('#1D7AA1'); // wave-blue — brand accent
    expect(html).toContain('#13364A'); // deep slate-blue — marathon route
    expect(html).toContain('#eef1f2'); // cool light slate substrate
    expect(html).toContain('--paper: #eef1f2'); // page substrate is not pure white
  });

  it('display unit is miles throughout — no km labels in user-facing UI', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain("var DISPLAY_UNITS = 'mi'");
    expect(html).not.toContain("Avg pace: <strong>' + pace.toFixed(1) + ' km/h</strong>");
  });

  it('active-segment highlighting + race-specific zoom-to-step key', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('dir-active-segment');
    expect(html).toContain('precomputeSnappedTurns');
    expect(html).toContain('adirondackMarathon.zoomToStep');
    expect(html).not.toContain('pocanticoHills.zoomToStep');
  });

  it('foot-race simulator wiring is present (mi units, 4:30 default goal)', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('initSimulator');
    expect(html).toContain('drawSimCourse');
    expect(html).toContain('Mile 0.0');
    expect(html).toContain('value="4"');
    expect(html).toContain('value="30"');
  });

  it('start pennant is a GL symbol layer (not an HTML start marker)', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain("'hq-start'");
    expect(html).toContain('addHqStartLayer');
    expect(html).not.toContain('aid-marker--start');
    // ADK-specific: the loop-aware start popup, not the Rockwood Hall copy
    expect(html).toContain('Schroon Lake · Start / Finish');
    expect(html).toContain('Hamlet of Adirondack · Half Start');
    expect(html).not.toContain('Rockwood Hall');
  });

  it('editorial aid table renders a mile header for this US race', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('aid-table__mile">Mile<');
  });

  it('host attribution + cartography credit + race date are intact', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toContain('adirondackmarathon.org');
    expect(html).toContain('falsesummitstudio.com');
    expect(html).toContain('Sunday, September 27, 2026');
  });

  it('active distance chip uses filled-block treatment (not just an inset ring)', () => {
    const html = readFileSync(DIST_HTML, 'utf8');
    expect(html).toMatch(/\.dir-dino-tab\.active\s*\{\s*[^}]*background:\s*currentColor/);
    expect(html).toContain('.dir-dino-tab.active .dir-dino-icon');
  });
});

describe('adirondack-marathon · embed build', () => {
  const EMBED_HTML = join(ROOT, 'dist', 'embed', 'adirondack-marathon', 'index.html');

  it('embed builds with adirondack-marathon in the editorial-races CSS allowlist', () => {
    expect(existsSync(EMBED_HTML)).toBe(true);
    const html = readFileSync(EMBED_HTML, 'utf8');
    expect(html).toMatch(/body\.embed-mode\.race-adirondack-marathon #mapView \.profile-section/);
    expect(html).toMatch(/body\.embed-mode\.race-adirondack-marathon \.embed-tabs/);
  });
});
